-- Teste de fumaça do RLS e das funções RPC (dados 100% fictícios).
-- Rodar com: bash supabase/tests/run.sh
-- Cada bloco diz no \echo o resultado esperado; "FALHA" = deve dar erro.
\set ON_ERROR_STOP 0
\pset footer off
-- Sem GRANTs aqui de propósito: valem só os que as migrations concedem.

insert into public.eventos (titulo, inicio, horas, vagas, status, perguntas) values
  ('Aberto 1 vaga', now() + interval '3 days', 5, 1, 'inscricoes_abertas',
   '[{"id":"carona","rotulo":"Precisa de carona?","tipo":"sim_nao","obrigatoria":true}]'),
  ('Rascunho', now() + interval '9 days', 3, null, 'planejado', '[]'),
  ('Já realizado', now() - interval '9 days', 4, null, 'realizado', '[]');
-- cadastro "importado da planilha" (e-mail com maiúscula: o banco normaliza)
insert into public.participantes (nome, email, ra, tipo) values ('Aluno B Silva', 'B@dac.unicamp.br', '222222', 'aluno_unicamp');
-- primeiro admin (bootstrap pelo SQL Editor: convite + "primeiro acesso")
insert into public.convites_admin (ra, nome, papel) values ('444444', 'Admin Teste', 'admin');

create function pg_temp.como(uid text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid)::text, true);
end $$;
create function pg_temp.anon() returns void language plpgsql as $$
begin perform set_config('role', 'anon', true); end $$;

\echo '=== 1. anônimo consulta RA existente -> primeiro nome "Aluno", 0 h, sem e-mail | RA inexistente -> vazio'
begin; select pg_temp.anon() \gset x_
select r ->> 'primeiro_nome' as nome, r -> 'horas' ->> 'horas_acumuladas' as acumuladas, r ? 'email' as vaza_email
  from public.consultar_ra(' 222.222 ') r;
select public.consultar_ra('999999') is null as inexistente_vazio; rollback;

\echo '=== 2. anônimo lê participantes direto -> FALHA | eventos -> sem o rascunho'
begin; select pg_temp.anon() \gset x_
select count(*) from public.participantes; rollback;
begin; select pg_temp.anon() \gset x_
select titulo from public.eventos order by id; rollback;

\echo '=== 3. inscrição com e-mail que não confere -> FALHA'
begin; select pg_temp.anon() \gset x_
select public.inscrever_publico(1, '222222', 'outro@x.br', '{}', '{"carona":"Sim"}'); rollback;

\echo '=== 4. sem responder pergunta obrigatória -> FALHA'
begin; select pg_temp.anon() \gset x_
select public.inscrever_publico(1, '222222', 'b@dac.unicamp.br'); rollback;

\echo '=== 5. B se inscreve (1 vaga) -> inscrito, novo_cadastro false'
begin; select pg_temp.anon() \gset x_
select public.inscrever_publico(1, '222222', ' B@DAC.unicamp.br ', '{}', '{"carona":"Sim"}'); commit;

\echo '=== 6. RA novo sem nome -> FALHA | com nome -> lista_espera, novo_cadastro true'
begin; select pg_temp.anon() \gset x_
select public.inscrever_publico(1, '333333', 'c@dac.unicamp.br', '{}', '{"carona":"Não"}'); rollback;
begin; select pg_temp.anon() \gset x_
select public.inscrever_publico(1, '333333', 'c@dac.unicamp.br', '{"nome":"Aluna C","celular":"19 9"}', '{"carona":"Não"}'); commit;

\echo '=== 7. externo sem RA -> lista_espera, novo | outro RA com e-mail de B -> FALHA'
begin; select pg_temp.anon() \gset x_
select public.inscrever_publico(1, null, 'ext@gmail.com', '{"nome":"Externa D"}', '{"carona":"Sim"}'); commit;
begin; select pg_temp.anon() \gset x_
select public.inscrever_publico(1, '555555', 'b@dac.unicamp.br', '{"nome":"X"}', '{"carona":"Sim"}'); rollback;

\echo '=== 8. inscrever em rascunho / realizado / de novo -> FALHA x3'
begin; select pg_temp.anon() \gset x_
select public.inscrever_publico(2, '222222', 'b@dac.unicamp.br'); rollback;
begin; select pg_temp.anon() \gset x_
select public.inscrever_publico(3, '222222', 'b@dac.unicamp.br'); rollback;
begin; select pg_temp.anon() \gset x_
select public.inscrever_publico(1, '222222', 'b@dac.unicamp.br', '{}', '{"carona":"Sim"}'); rollback;

\echo '=== 9. eventos abertos -> só "Aberto 1 vaga", vagas_restantes 0'
begin; select pg_temp.anon() \gset x_
select titulo, vagas_restantes from public.listar_eventos_abertos(); rollback;

\echo '=== 10. B cancela com e-mail errado -> FALHA | certo -> ok; C (1ª da espera) é promovida'
begin; select pg_temp.anon() \gset x_
select public.cancelar_inscricao_publico(1, '222222', 'x@x.br'); rollback;
begin; select pg_temp.anon() \gset x_
select public.cancelar_inscricao_publico(1, '222222', 'b@dac.unicamp.br'); commit;
select p.nome, i.status from public.inscricoes i join public.participantes p on p.id = i.participante_id order by p.nome;

\echo '=== 11. cadastro no Auth sem convite -> FALHA x2 | com convite -> vira admin; convite usado'
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000f1', 'qualquer@gmail.com');
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000f2', 'admin.555555@mutiroes.invalid');
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000a', 'admin.444444@mutiroes.invalid');
select o.ra, o.nome, o.papel, c.usado_em is not null as convite_usado
  from public.organizadores o join public.convites_admin c using (ra);

\echo '=== 12. reutilizar o mesmo convite -> FALHA'
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a2', 'ADMIN.444444@mutiroes.invalid');

\echo '=== 13. admin marca presença de C, ajuste +2h'
begin; select pg_temp.como('00000000-0000-0000-0000-00000000000a') \gset x_
update public.inscricoes set status = 'presente' where participante_id = (select id from public.participantes where ra = '333333');
insert into public.ajustes_horas (participante_id, horas, motivo) select id, 2, 'teste' from public.participantes where ra = '333333';
commit;
select status, presenca_registrada_por is not null as carimbado from public.inscricoes where status = 'presente';

\echo '=== 14. C pede: e-mail errado -> FALHA | 8h -> FALHA (saldo 7) | 3h -> ok | de novo -> FALHA'
begin; select pg_temp.anon() \gset x_
select public.solicitar_validacao_publico('333333', 'z@z.br', 1); rollback;
begin; select pg_temp.anon() \gset x_
select public.solicitar_validacao_publico('333333', 'c@dac.unicamp.br', 8); rollback;
begin; select pg_temp.anon() \gset x_
select public.solicitar_validacao_publico('333333', 'c@dac.unicamp.br', 3) > 0 as criada; commit;
begin; select pg_temp.anon() \gset x_
select public.solicitar_validacao_publico('333333', 'c@dac.unicamp.br', 1); rollback;

\echo '=== 15. consulta de C -> 7 acumuladas, 3 pendentes, 4 disponíveis, participação presente'
begin; select pg_temp.anon() \gset x_
select r -> 'horas' ->> 'horas_acumuladas' as acum, r -> 'horas' ->> 'horas_pendentes' as pend,
       r -> 'horas' ->> 'horas_disponiveis' as disp, r -> 'participacoes' -> 0 ->> 'status' as part
  from public.consultar_ra('333333') r; rollback;

\echo '=== 16. conta logada SEM papel de organização: vê 0 participantes, não cria convite (FALHA)'
insert into public.convites_admin (ra, nome) values ('666666', 'Sem papel');
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000e1', 'admin.666666@mutiroes.invalid');
delete from public.organizadores where ra = '666666';
begin; select pg_temp.como('00000000-0000-0000-0000-0000000000e1') \gset x_
select count(*) as participantes_visiveis from public.participantes; rollback;
begin; select pg_temp.como('00000000-0000-0000-0000-0000000000e1') \gset x_
insert into public.convites_admin (ra, nome) values ('777777', 'X'); rollback;

\echo '=== 17. organizador (não admin) cria convite -> FALHA | admin cria -> ok'
insert into public.convites_admin (ra, nome, papel) values ('888888', 'Org Comum', 'organizador');
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000b8', 'admin.888888@mutiroes.invalid');
begin; select pg_temp.como('00000000-0000-0000-0000-0000000000b8') \gset x_
insert into public.convites_admin (ra, nome) values ('999991', 'X'); rollback;
begin; select pg_temp.como('00000000-0000-0000-0000-00000000000a') \gset x_
insert into public.convites_admin (ra, nome) values ('999992', 'Convidado') returning ra; commit;

\echo '=== 18. remover / rebaixar o último admin -> FALHA, FALHA'
begin; select pg_temp.como('00000000-0000-0000-0000-00000000000a') \gset x_
select public.remover_organizador('00000000-0000-0000-0000-00000000000a'); rollback;
begin; select pg_temp.como('00000000-0000-0000-0000-00000000000a') \gset x_
update public.organizadores set papel = 'organizador' where ra = '444444'; rollback;

\echo '=== 19. admin redefine acesso do org 888888 -> conta apagada (0), membro (0), convite reaberto (t)'
begin; select pg_temp.como('00000000-0000-0000-0000-00000000000a') \gset x_
select public.redefinir_acesso_admin('00000000-0000-0000-0000-0000000000b8'); commit;
select (select count(*) from auth.users where email = 'admin.888888@mutiroes.invalid') as contas,
       (select count(*) from public.organizadores where ra = '888888') as membro,
       (select usado_em is null from public.convites_admin where ra = '888888') as convite_aberto;

\echo '=== 20. conta sem papel chama remover_organizador -> FALHA'
begin; select pg_temp.como('00000000-0000-0000-0000-0000000000e1') \gset x_
select public.remover_organizador('00000000-0000-0000-0000-00000000000a'); rollback;

\echo '=== 21. aluno sem RA -> FALHA (constraint) | e-mail duplicado com maiúsculas -> FALHA'
insert into public.participantes (nome, email, tipo) values ('Sem RA', 'semra@x.br', 'aluno_unicamp');
insert into public.participantes (nome, email, tipo) values ('Dup', 'EXT@Gmail.com', 'externo');
