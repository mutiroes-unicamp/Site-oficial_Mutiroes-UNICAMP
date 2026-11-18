-- =====================================================================
-- Funções chamadas pelo site (supabase.rpc(...)).
-- Regras de negócio que não cabem em RLS ficam aqui, no servidor.
-- Mensagens de erro são exibidas diretamente ao usuário.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1º login: vincula a conta a um cadastro existente (importado da planilha)
-- com o mesmo e-mail. Retorna o cadastro, ou nada se for preciso criar um.
-- ---------------------------------------------------------------------
create or replace function public.vincular_minha_conta()
returns setof public.participantes
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_uid   uuid := (select auth.uid());
  v_email text := lower((select auth.jwt()) ->> 'email');
begin
  if v_uid is null then
    raise exception 'Faça login primeiro';
  end if;

  update public.participantes
     set user_id = v_uid
   where lower(email::text) = v_email and user_id is null  -- lower(): com search_path vazio o "=" do citext não é usado
     and not exists (select 1 from public.participantes where user_id = v_uid);

  return query select * from public.participantes where user_id = v_uid;
end $$;

-- ---------------------------------------------------------------------
-- Eventos visíveis ao aluno, com vagas restantes e o status da sua inscrição
-- (vagas restantes precisam contar inscrições de outras pessoas, que o RLS esconde)
-- ---------------------------------------------------------------------
create or replace function public.listar_eventos_aluno()
returns table (
  id bigint, titulo text, descricao text, categoria text, local text,
  inicio timestamptz, horas numeric, vagas integer, vagas_restantes integer,
  inscricoes_ate timestamptz, status public.status_evento, perguntas jsonb,
  minha_inscricao public.status_inscricao
)
language sql stable security definer set search_path = ''
as $$
  select e.id, e.titulo, e.descricao, c.nome, e.local, e.inicio, e.horas, e.vagas,
         case when e.vagas is null then null
              else greatest(e.vagas - (select count(*) from public.inscricoes i
                                       where i.evento_id = e.id
                                         and i.status in ('inscrito', 'presente', 'ausente')), 0)::int
         end,
         e.inscricoes_ate, e.status, e.perguntas,
         (select i.status from public.inscricoes i
           where i.evento_id = e.id and i.participante_id = (select privado.meu_participante_id()))
  from public.eventos e
  left join public.categorias_evento c on c.id = e.categoria_id
  where e.status <> 'planejado'
  order by e.inicio desc;
$$;

-- ---------------------------------------------------------------------
-- Inscrição: confere prazo, perguntas obrigatórias e vagas (lista de espera se lotado)
-- ---------------------------------------------------------------------
create or replace function public.inscrever_em_evento(p_evento_id bigint, p_respostas jsonb default '{}')
returns public.status_inscricao
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_part     uuid := (select privado.meu_participante_id());
  v_ev       public.eventos;
  v_ocupadas integer;
  v_status   public.status_inscricao;
  v_atual    public.status_inscricao;
  v_perg     jsonb;
begin
  if v_part is null then
    raise exception 'Complete seu cadastro antes de se inscrever';
  end if;
  if p_respostas is null or jsonb_typeof(p_respostas) <> 'object' then
    p_respostas := '{}';
  end if;

  -- trava o evento para a contagem de vagas não ter corrida
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

  select status into v_atual from public.inscricoes
   where evento_id = p_evento_id and participante_id = v_part;
  if v_atual is not null and v_atual <> 'cancelada' then
    raise exception 'Você já está inscrito(a) neste evento';
  end if;

  select count(*) into v_ocupadas from public.inscricoes
   where evento_id = p_evento_id and status in ('inscrito', 'presente', 'ausente');
  v_status := case when v_ev.vagas is not null and v_ocupadas >= v_ev.vagas
                   then 'lista_espera' else 'inscrito' end;

  insert into public.inscricoes (participante_id, evento_id, status, origem, respostas)
  values (v_part, p_evento_id, v_status, 'plataforma', p_respostas)
  on conflict (participante_id, evento_id) do update
     set status = excluded.status, respostas = excluded.respostas, criado_em = now();

  return v_status;
end $$;

-- ---------------------------------------------------------------------
-- Cancelamento pelo aluno (antes do evento); promove o 1º da lista de espera
-- ---------------------------------------------------------------------
create or replace function public.cancelar_inscricao(p_evento_id bigint)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_part   uuid := (select privado.meu_participante_id());
  v_ev     public.eventos;
begin
  select * into v_ev from public.eventos where id = p_evento_id for update;
  if not found then
    raise exception 'Evento não encontrado';
  end if;
  if v_ev.status not in ('inscricoes_abertas', 'inscricoes_encerradas') or now() >= v_ev.inicio then
    raise exception 'Não é mais possível cancelar esta inscrição';
  end if;

  update public.inscricoes set status = 'cancelada'
   where evento_id = p_evento_id and participante_id = v_part
     and status in ('inscrito', 'lista_espera');
  if not found then
    raise exception 'Você não tem inscrição ativa neste evento';
  end if;

  -- liberou vaga: promove o mais antigo da lista de espera
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
create or replace function public.solicitar_validacao(p_horas numeric)
returns bigint
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_part  uuid := (select privado.meu_participante_id());
  v_disp  numeric;
  v_id    bigint;
begin
  if v_part is null then
    raise exception 'Complete seu cadastro primeiro';
  end if;
  if p_horas is null or p_horas <= 0 then
    raise exception 'Informe uma quantidade de horas maior que zero';
  end if;
  if p_horas <> round(p_horas, 1) then
    raise exception 'Use no máximo uma casa decimal';
  end if;

  -- trava o participante: duas solicitações simultâneas não passam do saldo
  perform 1 from public.participantes where id = v_part for update;

  if exists (select 1 from public.solicitacoes_validacao
              where participante_id = v_part and status = 'pendente') then
    raise exception 'Você já tem uma solicitação pendente. Aguarde a análise da organização.';
  end if;

  select horas_disponiveis into v_disp from public.saldo_horas where participante_id = v_part;
  if p_horas > coalesce(v_disp, 0) then
    raise exception 'Horas insuficientes: você tem % h disponíveis', coalesce(v_disp, 0);
  end if;

  insert into public.solicitacoes_validacao (participante_id, horas)
  values (v_part, p_horas) returning id into v_id;
  return v_id;
end $$;

-- Funções de aluno exigem login
revoke execute on function public.vincular_minha_conta()            from public, anon;
revoke execute on function public.listar_eventos_aluno()            from public, anon;
revoke execute on function public.inscrever_em_evento(bigint, jsonb) from public, anon;
revoke execute on function public.cancelar_inscricao(bigint)        from public, anon;
revoke execute on function public.solicitar_validacao(numeric)      from public, anon;
grant  execute on function public.vincular_minha_conta()            to authenticated;
grant  execute on function public.listar_eventos_aluno()            to authenticated;
grant  execute on function public.inscrever_em_evento(bigint, jsonb) to authenticated;
grant  execute on function public.cancelar_inscricao(bigint)        to authenticated;
grant  execute on function public.solicitar_validacao(numeric)      to authenticated;
