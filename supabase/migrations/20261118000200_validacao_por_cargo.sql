-- =====================================================================
-- Validação de horas restrita a Capitã(o) e Vice-capitã(o).
--
-- * Só esses cargos leem/decidem solicitações de validação (RLS).
-- * Só esses cargos dão ou tiram esses cargos (em membros e convites),
--   para que outro admin não possa se autopromover.
-- * Os demais organizadores continuam vendo os TOTAIS de horas validadas
--   (saldo_horas soma as solicitações por uma função interna).
-- * Pedidos de alunos (solicitar_validacao_publico) e a consulta por RA
--   continuam funcionando: são funções SECURITY DEFINER.
-- =====================================================================

-- Cargo que pode validar horas (aceita com ou sem acento, maiúsculas)
create or replace function privado.cargo_valida(p_cargo text)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(translate(lower(btrim(p_cargo)), 'ãáâà', 'aaaa')
                  in ('capita', 'capitao', 'vice-capita', 'vice-capitao'), false);
$$;

create or replace function privado.pode_validar()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.organizadores
                 where user_id = (select auth.uid()) and privado.cargo_valida(cargo));
$$;

-- ---------------------------------------------------------------------
-- RLS de solicitações: só quem pode validar
-- ---------------------------------------------------------------------
drop policy solicitacoes_leitura on public.solicitacoes_validacao;
drop policy solicitacoes_org_inserir on public.solicitacoes_validacao;
drop policy solicitacoes_org_alterar on public.solicitacoes_validacao;
drop policy solicitacoes_org_excluir on public.solicitacoes_validacao;

create policy solicitacoes_leitura on public.solicitacoes_validacao for select to authenticated
  using ((select privado.pode_validar()));
create policy solicitacoes_inserir on public.solicitacoes_validacao for insert to authenticated
  with check ((select privado.pode_validar()));
create policy solicitacoes_alterar on public.solicitacoes_validacao for update to authenticated
  using ((select privado.pode_validar())) with check ((select privado.pode_validar()));
create policy solicitacoes_excluir on public.solicitacoes_validacao for delete to authenticated
  using ((select privado.pode_validar()));

-- ---------------------------------------------------------------------
-- saldo_horas: totais visíveis a todos os organizadores, sem expor as solicitações
-- ---------------------------------------------------------------------
create or replace function privado.horas_solicitacoes(p_participante uuid, out validadas numeric, out pendentes numeric)
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(horas) filter (where status = 'aprovada'), 0),
         coalesce(sum(horas) filter (where status = 'pendente'), 0)
  from public.solicitacoes_validacao where participante_id = p_participante;
$$;

create or replace view public.saldo_horas with (security_invoker = true) as
select
  p.id                                                as participante_id,
  coalesce(pr.h, 0) + coalesce(aj.h, 0)               as horas_acumuladas,
  sv.validadas                                        as horas_validadas,
  sv.pendentes                                        as horas_pendentes,
  coalesce(pr.h, 0) + coalesce(aj.h, 0) - sv.validadas - sv.pendentes as horas_disponiveis
from public.participantes p
left join lateral (
  select sum(e.horas) as h
  from public.inscricoes i join public.eventos e on e.id = i.evento_id
  where i.participante_id = p.id and i.status = 'presente'
) pr on true
left join lateral (
  select sum(a.horas) as h from public.ajustes_horas a where a.participante_id = p.id
) aj on true
cross join lateral privado.horas_solicitacoes(p.id) sv;

-- ---------------------------------------------------------------------
-- Cargos de validação: só quem já valida pode atribuir/retirar
-- (redefinir_acesso_admin apenas reaproveita o cargo existente: liberado)
-- ---------------------------------------------------------------------
create or replace function privado.proteger_cargo_validacao()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_antes text := case when tg_op = 'UPDATE' then old.cargo end;
begin
  if (select auth.uid()) is null                                  -- SQL Editor / migrações
     or current_setting('mutiroes.reaproveitando_cargo', true) = 'on'
     or privado.cargo_valida(new.cargo) = privado.cargo_valida(v_antes) and tg_op = 'UPDATE'
     or (tg_op = 'INSERT' and not privado.cargo_valida(new.cargo))
     or privado.pode_validar() then
    return new;
  end if;
  raise exception 'Apenas Capitã(o) ou Vice-capitã(o) podem atribuir ou retirar esse cargo';
end $$;

create trigger organizadores_proteger_cargo before update of cargo on public.organizadores
  for each row execute function privado.proteger_cargo_validacao();
create trigger convites_proteger_cargo before insert or update of cargo on public.convites_admin
  for each row execute function privado.proteger_cargo_validacao();

-- redefinir_acesso_admin reabre o convite com o MESMO cargo: marca a exceção
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
  perform set_config('mutiroes.reaproveitando_cargo', 'on', true);
  insert into public.convites_admin (ra, nome, cargo, papel, criado_por)
  values (v_o.ra, v_o.nome, v_o.cargo, v_o.papel, (select auth.uid()))
  on conflict (ra) do update set nome = excluded.nome, cargo = excluded.cargo, papel = excluded.papel, criado_por = excluded.criado_por,
     criado_em = now(), expira_em = now() + interval '7 days', usado_em = null;
  perform set_config('mutiroes.reaproveitando_cargo', 'off', true);
  delete from auth.users where id = p_user_id;
end $$;

-- o gatilho de criação de conta (depois_criar_usuario) copia o cargo do convite:
-- ele roda sem auth.uid(), então passa pela proteção (o convite já foi validado ao ser criado)

revoke execute on all functions in schema privado from public;
grant execute on all functions in schema privado to anon, authenticated, service_role;
grant execute on function privado.cargo_valida(text) to supabase_auth_admin;
grant select on public.saldo_horas to authenticated, service_role;
revoke all on public.saldo_horas from anon;
