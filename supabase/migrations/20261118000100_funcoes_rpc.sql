-- =====================================================================
-- Funções chamadas pelo site (supabase.rpc(...)).
--
-- Público (sem login), identificado por RA:
--   consultar_ra, listar_eventos_abertos, inscrever_publico,
--   cancelar_inscricao_publico, solicitar_validacao_publico
--   As que ALTERAM dados exigem também o e-mail cadastrado (conferência, sem envio).
--   A consulta mostra só o primeiro nome e nunca e-mail/telefone.
--
-- Organização (logada): redefinir_acesso_admin, remover_organizador.
-- Mensagens de erro são exibidas diretamente ao usuário.
-- =====================================================================

create or replace function privado.ra_limpo(p_ra text)
returns text language sql immutable set search_path = '' as $$
  select nullif(regexp_replace(coalesce(p_ra, ''), '\D', '', 'g'), '');
$$;

create or replace function privado.email_limpo(p_email text)
returns text language plpgsql immutable set search_path = '' as $$
declare v text := lower(btrim(coalesce(p_email, '')));
begin
  if v !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Informe um e-mail válido';
  end if;
  return v;
end $$;

-- Localiza o participante pelo RA e confere o e-mail cadastrado
create or replace function privado.participante_conferido(p_ra text, p_email text)
returns public.participantes
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_ra    text := privado.ra_limpo(p_ra);
  v_email text := privado.email_limpo(p_email);
  v_p     public.participantes;
begin
  if v_ra is not null then
    select * into v_p from public.participantes where ra = v_ra for update;
    if not found then
      raise exception 'RA não encontrado. Confira o número ou fale com a organização.';
    end if;
  else
    select * into v_p from public.participantes where email = v_email for update;
    if not found then
      raise exception 'Cadastro não encontrado para este e-mail.';
    end if;
  end if;
  if v_p.email::text <> v_email then
    raise exception 'O e-mail informado não confere com o cadastro. Use o e-mail que você informou ao Mutirões ou fale com a organização.';
  end if;
  return v_p;
end $$;

-- ---------------------------------------------------------------------
-- Consulta pública por RA (como o sistema antigo)
-- ---------------------------------------------------------------------
create or replace function public.consultar_ra(p_ra text)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'primeiro_nome', split_part(p.nome, ' ', 1),
    'tipo', p.tipo,
    'horas', (select to_jsonb(s) - 'participante_id' from public.saldo_horas s where s.participante_id = p.id),
    'participacoes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'evento_id', e.id, 'titulo', e.titulo, 'inicio', e.inicio, 'horas', e.horas,
               'status', i.status, 'status_evento', e.status) order by e.inicio desc)
      from public.inscricoes i join public.eventos e on e.id = i.evento_id
      where i.participante_id = p.id), '[]'),
    'solicitacoes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'horas', s.horas, 'status', s.status, 'solicitado_em', s.solicitado_em,
               'decidido_em', s.decidido_em,
               'observacao', case when s.status = 'recusada' then s.observacao end) order by s.solicitado_em desc)
      from public.solicitacoes_validacao s where s.participante_id = p.id), '[]'),
    'ajustes', coalesce((
      select jsonb_agg(jsonb_build_object('horas', a.horas, 'motivo', a.motivo, 'criado_em', a.criado_em)
                       order by a.criado_em desc)
      from public.ajustes_horas a where a.participante_id = p.id), '[]')
  )
  from public.participantes p
  where p.ra = privado.ra_limpo(p_ra);
$$;

-- ---------------------------------------------------------------------
-- Próximos eventos (com vagas restantes, que o público não consegue contar)
-- ---------------------------------------------------------------------
create or replace function public.listar_eventos_abertos()
returns table (
  id bigint, titulo text, descricao text, categoria text, local text,
  inicio timestamptz, horas numeric, vagas integer, vagas_restantes integer,
  inscricoes_ate timestamptz, status public.status_evento, perguntas jsonb
)
language sql stable security definer set search_path = ''
as $$
  select e.id, e.titulo, e.descricao, c.nome, e.local, e.inicio, e.horas, e.vagas,
         case when e.vagas is null then null
              else greatest(e.vagas - (select count(*) from public.inscricoes i
                                       where i.evento_id = e.id
                                         and i.status in ('inscrito', 'presente', 'ausente')), 0)::int
         end,
         e.inscricoes_ate, e.status, e.perguntas
  from public.eventos e
  left join public.categorias_evento c on c.id = e.categoria_id
  where e.status in ('inscricoes_abertas', 'inscricoes_encerradas') and e.inicio >= now()
  order by e.inicio;
$$;

-- ---------------------------------------------------------------------
-- Inscrição pública. Com RA: aluno Unicamp; sem RA: comunidade externa (pelo e-mail).
-- Quem já tem cadastro precisa informar o e-mail cadastrado; quem não tem é
-- cadastrado com os dados de p_dados (nome obrigatório). Dados existentes não
-- são sobrescritos — só campos vazios são completados.
-- p_dados: {nome, curso_id, ano_ingresso, celular, idade, genero, na_comunidade}
-- ---------------------------------------------------------------------
create or replace function public.inscrever_publico(
  p_evento_id bigint, p_ra text, p_email text,
  p_dados jsonb default '{}', p_respostas jsonb default '{}'
)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_ra       text := privado.ra_limpo(p_ra);
  v_email    text := privado.email_limpo(p_email);
  v_ev       public.eventos;
  v_p        public.participantes;
  v_novo     boolean := false;
  v_ocupadas integer;
  v_status   public.status_inscricao;
  v_atual    public.status_inscricao;
  v_perg     jsonb;
  v_nome     text;
begin
  if p_dados is null or jsonb_typeof(p_dados) <> 'object' then p_dados := '{}'; end if;
  if p_respostas is null or jsonb_typeof(p_respostas) <> 'object' then p_respostas := '{}'; end if;
  if v_ra is not null and v_ra !~ '^\d{5,6}$' then
    raise exception 'RA inválido: use 5 ou 6 dígitos';
  end if;

  -- evento (travado: a contagem de vagas não tem corrida)
  select * into v_ev from public.eventos where id = p_evento_id for update;
  if not found or v_ev.status = 'planejado' then
    raise exception 'Evento não encontrado';
  end if;
  if v_ev.status <> 'inscricoes_abertas'
     or (v_ev.inscricoes_ate is not null and now() > v_ev.inscricoes_ate) then
    raise exception 'As inscrições para este evento estão encerradas';
  end if;
  for v_perg in select * from jsonb_array_elements(v_ev.perguntas) loop
    if coalesce((v_perg ->> 'obrigatoria')::boolean, false)
       and coalesce(btrim(p_respostas ->> (v_perg ->> 'id')), '') = '' then
      raise exception 'Responda: %', v_perg ->> 'rotulo';
    end if;
  end loop;

  -- participante
  if v_ra is not null then
    select * into v_p from public.participantes where ra = v_ra for update;
  end if;
  if v_p.id is null then
    select * into v_p from public.participantes where email = v_email for update;
    if v_p.id is not null and v_p.ra is not null and v_p.ra is distinct from v_ra then
      raise exception 'Este e-mail já está cadastrado com outro RA. Confira o RA ou fale com a organização.';
    end if;
  end if;

  if v_p.id is not null then
    if v_p.email::text <> v_email then
      raise exception 'O e-mail informado não confere com o cadastro deste RA. Use o e-mail que você informou ao Mutirões ou fale com a organização.';
    end if;
    -- completa só o que está vazio (e registra o RA de quem era externo)
    update public.participantes set
      ra            = coalesce(ra, v_ra),
      tipo          = case when coalesce(ra, v_ra) is not null then 'aluno_unicamp' else tipo end,
      curso_id      = coalesce(curso_id, nullif(p_dados ->> 'curso_id', '')::smallint),
      ano_ingresso  = coalesce(ano_ingresso, nullif(p_dados ->> 'ano_ingresso', '')::smallint),
      celular       = coalesce(celular, nullif(btrim(p_dados ->> 'celular'), '')),
      idade         = coalesce(idade, nullif(p_dados ->> 'idade', '')::smallint),
      genero        = coalesce(genero, nullif(p_dados ->> 'genero', '')),
      na_comunidade = coalesce(na_comunidade, (p_dados ->> 'na_comunidade')::boolean)
    where id = v_p.id
    returning * into v_p;
  else
    v_nome := nullif(btrim(p_dados ->> 'nome'), '');
    if v_nome is null then
      raise exception 'Informe seu nome completo';
    end if;
    insert into public.participantes
      (nome, email, ra, tipo, curso_id, ano_ingresso, celular, idade, genero, na_comunidade)
    values (
      v_nome, v_email, v_ra,
      case when v_ra is null then 'externo' else 'aluno_unicamp' end::public.tipo_participante,
      nullif(p_dados ->> 'curso_id', '')::smallint,
      nullif(p_dados ->> 'ano_ingresso', '')::smallint,
      nullif(btrim(p_dados ->> 'celular'), ''),
      nullif(p_dados ->> 'idade', '')::smallint,
      nullif(p_dados ->> 'genero', ''),
      (p_dados ->> 'na_comunidade')::boolean)
    returning * into v_p;
    v_novo := true;
  end if;

  -- inscrição
  select status into v_atual from public.inscricoes
   where evento_id = p_evento_id and participante_id = v_p.id;
  if v_atual is not null and v_atual <> 'cancelada' then
    raise exception 'Você já está inscrito(a) neste evento';
  end if;
  select count(*) into v_ocupadas from public.inscricoes
   where evento_id = p_evento_id and status in ('inscrito', 'presente', 'ausente');
  v_status := case when v_ev.vagas is not null and v_ocupadas >= v_ev.vagas
                   then 'lista_espera' else 'inscrito' end;

  insert into public.inscricoes (participante_id, evento_id, status, origem, respostas)
  values (v_p.id, p_evento_id, v_status, 'plataforma', p_respostas)
  on conflict (participante_id, evento_id) do update
     set status = excluded.status, respostas = excluded.respostas, criado_em = now();

  return jsonb_build_object('status', v_status, 'primeiro_nome', split_part(v_p.nome, ' ', 1),
                            'novo_cadastro', v_novo);
end $$;

-- ---------------------------------------------------------------------
-- Cancelamento (antes do evento); promove o 1º da lista de espera
-- ---------------------------------------------------------------------
create or replace function public.cancelar_inscricao_publico(p_evento_id bigint, p_ra text, p_email text)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_ev public.eventos;
  v_p  public.participantes;
begin
  select * into v_ev from public.eventos where id = p_evento_id for update;
  if not found then
    raise exception 'Evento não encontrado';
  end if;
  if v_ev.status not in ('inscricoes_abertas', 'inscricoes_encerradas') or now() >= v_ev.inicio then
    raise exception 'Não é mais possível cancelar esta inscrição';
  end if;
  v_p := privado.participante_conferido(p_ra, p_email);

  update public.inscricoes set status = 'cancelada'
   where evento_id = p_evento_id and participante_id = v_p.id
     and status in ('inscrito', 'lista_espera');
  if not found then
    raise exception 'Não há inscrição ativa neste evento';
  end if;

  update public.inscricoes set status = 'inscrito'
   where id = (select id from public.inscricoes
                where evento_id = p_evento_id and status = 'lista_espera'
                order by criado_em limit 1)
     and (v_ev.vagas is null or (select count(*) from public.inscricoes
                                  where evento_id = p_evento_id
                                    and status in ('inscrito', 'presente', 'ausente')) < v_ev.vagas);
end $$;

-- ---------------------------------------------------------------------
-- Solicitação de validação: no máximo o saldo disponível e uma pendente por vez
-- ---------------------------------------------------------------------
create or replace function public.solicitar_validacao_publico(p_ra text, p_email text, p_horas numeric)
returns bigint
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_p    public.participantes;
  v_disp numeric;
  v_id   bigint;
begin
  if privado.ra_limpo(p_ra) is null then
    raise exception 'Informe seu RA';
  end if;
  if p_horas is null or p_horas <= 0 then
    raise exception 'Informe uma quantidade de horas maior que zero';
  end if;
  if p_horas <> round(p_horas, 1) then
    raise exception 'Use no máximo uma casa decimal';
  end if;

  v_p := privado.participante_conferido(p_ra, p_email);  -- trava a linha do participante

  if exists (select 1 from public.solicitacoes_validacao
              where participante_id = v_p.id and status = 'pendente') then
    raise exception 'Você já tem uma solicitação pendente. Aguarde a análise da organização.';
  end if;
  select horas_disponiveis into v_disp from public.saldo_horas where participante_id = v_p.id;
  if p_horas > coalesce(v_disp, 0) then
    raise exception 'Horas insuficientes: você tem % h disponíveis', coalesce(v_disp, 0);
  end if;

  insert into public.solicitacoes_validacao (participante_id, horas)
  values (v_p.id, p_horas) returning id into v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- Equipe (só admin)
-- ---------------------------------------------------------------------
-- Esqueceu a senha: apaga a conta e reabre o convite; a pessoa define
-- uma nova senha no "Primeiro acesso".
create or replace function public.redefinir_acesso_admin(p_user_id uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare v_o public.organizadores;
begin
  if not privado.is_admin() then
    raise exception 'Apenas administradores podem fazer isso';
  end if;
  select * into v_o from public.organizadores where user_id = p_user_id;
  if not found then
    raise exception 'Membro não encontrado';
  end if;
  insert into public.convites_admin (ra, nome, cargo, papel, criado_por)
  values (v_o.ra, v_o.nome, v_o.cargo, v_o.papel, (select auth.uid()))
  on conflict (ra) do update set nome = excluded.nome, cargo = excluded.cargo, papel = excluded.papel, criado_por = excluded.criado_por,
     criado_em = now(), expira_em = now() + interval '7 days', usado_em = null;
  delete from auth.users where id = p_user_id;   -- organizadores sai junto (on delete cascade)
end $$;

create or replace function public.remover_organizador(p_user_id uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare v_o public.organizadores;
begin
  if not privado.is_admin() then
    raise exception 'Apenas administradores podem fazer isso';
  end if;
  select * into v_o from public.organizadores where user_id = p_user_id;
  if not found then
    raise exception 'Membro não encontrado';
  end if;
  if v_o.papel = 'admin' and (select count(*) from public.organizadores where papel = 'admin') = 1 then
    raise exception 'Não é possível remover o último administrador';
  end if;
  delete from auth.users where id = p_user_id;
end $$;

-- Não deixa a equipe ficar sem administrador por troca de papel
create or replace function privado.manter_um_admin()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.papel = 'admin' and new.papel <> 'admin'
     and (select count(*) from public.organizadores where papel = 'admin') = 1 then
    raise exception 'Não é possível rebaixar o último administrador';
  end if;
  return new;
end $$;
create trigger organizadores_manter_admin before update of papel on public.organizadores
  for each row execute function privado.manter_um_admin();

-- ---------------------------------------------------------------------
-- Permissões
-- ---------------------------------------------------------------------
revoke execute on function
  public.consultar_ra(text), public.listar_eventos_abertos(),
  public.inscrever_publico(bigint, text, text, jsonb, jsonb),
  public.cancelar_inscricao_publico(bigint, text, text),
  public.solicitar_validacao_publico(text, text, numeric),
  public.redefinir_acesso_admin(uuid), public.remover_organizador(uuid)
  from public;
grant execute on function
  public.consultar_ra(text), public.listar_eventos_abertos(),
  public.inscrever_publico(bigint, text, text, jsonb, jsonb),
  public.cancelar_inscricao_publico(bigint, text, text),
  public.solicitar_validacao_publico(text, text, numeric)
  to anon, authenticated;
grant execute on function public.redefinir_acesso_admin(uuid), public.remover_organizador(uuid) to authenticated;

revoke execute on all functions in schema privado from public;
grant execute on all functions in schema privado to anon, authenticated, service_role;
