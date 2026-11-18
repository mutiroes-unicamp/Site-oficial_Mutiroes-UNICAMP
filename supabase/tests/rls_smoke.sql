-- Teste de fumaça do RLS e das funções RPC (dados 100% fictícios).
-- Rodar com: bash supabase/tests/run.sh
-- Cada bloco diz no \echo o resultado esperado; "FALHA" = deve dar erro.
\set ON_ERROR_STOP 0
\pset footer off

-- Sem GRANTs aqui de propósito: valem só os que as migrations concedem.

insert into auth.users values
  ('00000000-0000-0000-0000-00000000000a', 'admin@x.br'),
  ('00000000-0000-0000-0000-0000000000a1', 'a@dac.unicamp.br'),
  ('00000000-0000-0000-0000-0000000000b1', 'b@dac.unicamp.br'),
  ('00000000-0000-0000-0000-0000000000c1', 'c@gmail.com');
insert into public.organizadores values ('00000000-0000-0000-0000-00000000000a', 'admin');
insert into public.eventos (titulo, inicio, horas, vagas, status, perguntas) values
  ('Aberto 1 vaga', now() + interval '3 days', 5, 1, 'inscricoes_abertas',
   '[{"id":"carona","rotulo":"Precisa de carona?","tipo":"sim_nao","obrigatoria":true}]'),
  ('Rascunho', now() + interval '9 days', 3, null, 'planejado', '[]'),
  ('Já realizado', now() - interval '9 days', 4, null, 'realizado', '[]');
-- cadastro "importado da planilha", ainda sem conta vinculada
insert into public.participantes (nome, email, ra, tipo) values ('Aluno B', 'B@dac.unicamp.br', '222222', 'aluno_unicamp');

create function pg_temp.como(uid text, email text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', uid, true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'email', email)::text, true);
end $$;
\set A '''00000000-0000-0000-0000-0000000000a1'', ''a@dac.unicamp.br'''
\set B '''00000000-0000-0000-0000-0000000000b1'', ''b@dac.unicamp.br'''
\set C '''00000000-0000-0000-0000-0000000000c1'', ''c@gmail.com'''
\set ADM '''00000000-0000-0000-0000-00000000000a'', ''admin@x.br'''

\echo '=== 1. A se cadastra com e-mail de outra pessoa -> FALHA'
begin; select pg_temp.como(:A) \gset x_
insert into public.participantes (user_id,nome,email,ra,tipo) values ('00000000-0000-0000-0000-0000000000a1','A','outro@x.br','111111','aluno_unicamp'); rollback;

\echo '=== 2. A se cadastra com o próprio e-mail -> ok'
begin; select pg_temp.como(:A) \gset x_
insert into public.participantes (user_id,nome,email,ra,tipo) values ('00000000-0000-0000-0000-0000000000a1','Aluno A','a@dac.unicamp.br','111111','aluno_unicamp'); commit;

\echo '=== 3. B faz 1º login e assume o cadastro importado (e-mail com maiúscula) -> 1 linha "Aluno B"'
begin; select pg_temp.como(:B) \gset x_
select nome, ra from public.vincular_minha_conta(); commit;

\echo '=== 4. A enxerga quantos participantes? -> 1'
begin; select pg_temp.como(:A) \gset x_
select count(*) as visiveis from public.participantes; rollback;

\echo '=== 5. A troca o próprio RA -> FALHA | troca celular -> ok'
begin; select pg_temp.como(:A) \gset x_
update public.participantes set ra='999999' where ra='111111'; rollback;
begin; select pg_temp.como(:A) \gset x_
update public.participantes set celular='19 99999-0000' where ra='111111'; commit;

\echo '=== 6. A insere inscrição direto na tabela (sem RPC) -> FALHA'
begin; select pg_temp.como(:A) \gset x_
insert into public.inscricoes (participante_id, evento_id) values (privado.meu_participante_id(), 1); rollback;

\echo '=== 7. A se inscreve sem responder pergunta obrigatória -> FALHA'
begin; select pg_temp.como(:A) \gset x_
select public.inscrever_em_evento(1, '{}'); rollback;

\echo '=== 8. A se inscreve (1 vaga) -> inscrito | B -> lista_espera | A de novo -> FALHA'
begin; select pg_temp.como(:A) \gset x_
select public.inscrever_em_evento(1, '{"carona":"Não"}') as a; commit;
begin; select pg_temp.como(:B) \gset x_
select public.inscrever_em_evento(1, '{"carona":"Sim"}') as b; commit;
begin; select pg_temp.como(:A) \gset x_
select public.inscrever_em_evento(1, '{"carona":"Não"}'); rollback;

\echo '=== 9. A vê vagas restantes 0 e evento rascunho invisível -> 2 eventos, vagas_restantes 0'
begin; select pg_temp.como(:A) \gset x_
select titulo, vagas_restantes, minha_inscricao from public.listar_eventos_aluno(); rollback;

\echo '=== 10. A se inscreve em rascunho / realizado -> FALHA, FALHA'
begin; select pg_temp.como(:A) \gset x_
select public.inscrever_em_evento(2); rollback;
begin; select pg_temp.como(:A) \gset x_
select public.inscrever_em_evento(3); rollback;

\echo '=== 11. A cancela -> B é promovido para inscrito'
begin; select pg_temp.como(:A) \gset x_
select public.cancelar_inscricao(1); commit;
select p.nome, i.status from public.inscricoes i join public.participantes p on p.id = i.participante_id order by p.nome;

\echo '=== 12. B marca a própria presença -> 0 linhas alteradas (sem erro, sem efeito)'
begin; select pg_temp.como(:B) \gset x_
update public.inscricoes set status='presente'; commit;
select status from public.inscricoes i join public.participantes p on p.id=i.participante_id where p.ra='222222';

\echo '=== 13. Admin marca presença de B, cria ajuste +2h e B fica com 7h'
begin; select pg_temp.como(:ADM) \gset x_
update public.inscricoes set status='presente' where status='inscrito';
insert into public.ajustes_horas (participante_id,horas,motivo) select id, 2, 'teste' from public.participantes where ra='222222';
commit;
select status, presenca_registrada_em is not null as carimbado, presenca_registrada_por is not null as por from public.inscricoes where status='presente';

\echo '=== 14. B pede 8h -> FALHA (saldo 7) | pede 3h -> ok | pede 1h -> FALHA (já pendente)'
begin; select pg_temp.como(:B) \gset x_
select public.solicitar_validacao(8); rollback;
begin; select pg_temp.como(:B) \gset x_
select public.solicitar_validacao(3) > 0 as criada; commit;
begin; select pg_temp.como(:B) \gset x_
select public.solicitar_validacao(1); rollback;

\echo '=== 15. Saldo de B visto por ele -> 7 acumuladas, 0 validadas, 3 pendentes, 4 disponíveis'
begin; select pg_temp.como(:B) \gset x_
select horas_acumuladas, horas_validadas, horas_pendentes, horas_disponiveis from public.saldo_horas; rollback;

\echo '=== 16. B aprova a própria solicitação -> 0 linhas | admin aprova -> carimbado'
begin; select pg_temp.como(:B) \gset x_
update public.solicitacoes_validacao set status='aprovada'; commit;
begin; select pg_temp.como(:ADM) \gset x_
update public.solicitacoes_validacao set status='aprovada'; commit;
select status, decidido_em is not null as em, decidido_por is not null as por from public.solicitacoes_validacao;

\echo '=== 17. anônimo: eventos visíveis (sem rascunho) e 0 participantes; RPC de aluno -> FALHA'
begin; set local role anon;
select titulo from public.eventos order by id; select count(*) as participantes_anon from public.participantes; rollback;
begin; set local role anon; select * from public.listar_eventos_aluno(); rollback;

\echo '=== 18. A tenta se promover a organizador -> FALHA'
begin; select pg_temp.como(:A) \gset x_
insert into public.organizadores values ('00000000-0000-0000-0000-0000000000a1','admin'); rollback;

\echo '=== 19. C (externo) se inscreve sem cadastro -> FALHA'
begin; select pg_temp.como(:C) \gset x_
select public.inscrever_em_evento(1, '{"carona":"Não"}'); rollback;

\echo '=== 20. externo sem RA -> ok | aluno sem RA -> FALHA | e-mail duplicado (maiúsculas) -> FALHA'
insert into public.participantes (nome,email,tipo) values ('Externo','ext@gmail.com','externo');
insert into public.participantes (nome,email,tipo) values ('Sem RA','semra@x.br','aluno_unicamp');
insert into public.participantes (nome,email,tipo) values ('Dup','EXT@Gmail.com','externo');
