-- =====================================================================
-- Mutirões UNICAMP — esquema inicial (v1)
--
-- Substitui a planilha "Controle de Presença - Mutirões":
--   Dados_Participantes  -> participantes
--   Eventos              -> eventos (+ formulário de inscrição configurável em `perguntas`)
--   Controle de Horas    -> inscricoes (1 linha por participante x evento, em vez da matriz)
--   "+3+8+5" nas fórmulas -> ajustes_horas (com motivo e autor)
--   Historico            -> solicitacoes_validacao
--
-- Regra central: horas NUNCA são digitadas; são calculadas pela view saldo_horas.
-- Toda tabela tem RLS habilitado. Sem policy = acesso negado.
--
-- Modelo de acesso:
--   * Alunos/voluntários NÃO têm login. Consultam, inscrevem-se e pedem validação
--     pelo RA, via funções RPC (migration funcoes_rpc), que conferem o e-mail
--     cadastrado nas ações que alteram dados. Tabelas: só a organização lê.
--   * Organização entra com RA + senha (Supabase Auth, e-mail técnico
--     admin.<RA>@mutiroes.invalid). Só cria conta quem tem convite em convites_admin.
-- RG e CPF dos Forms antigos NÃO são armazenados (decisão da organização, LGPD).
-- =====================================================================

create extension if not exists citext with schema extensions;

-- Funções auxiliares SECURITY DEFINER ficam fora do schema exposto pela Data API
-- (em `public` qualquer função vira endpoint chamável por anon/authenticated).
create schema if not exists privado;
grant usage on schema privado to anon, authenticated;

-- ---------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------
create type public.tipo_participante as enum ('aluno_unicamp', 'externo');

create type public.status_evento as enum (
  'planejado',              -- visível só para a organização
  'inscricoes_abertas',
  'inscricoes_encerradas',
  'realizado',
  'cancelado'
);

-- Mapeamento do legado: 'Participou' -> presente, 'Não Participou' -> ausente,
-- 'Não conseguiu vaga' -> sem_vaga, inscrito no Forms sem marcação -> inscrito.
create type public.status_inscricao as enum (
  'inscrito', 'lista_espera', 'sem_vaga', 'presente', 'ausente', 'cancelada'
);

create type public.status_solicitacao as enum ('pendente', 'aprovada', 'recusada');

-- ---------------------------------------------------------------------
-- Tabelas de referência
-- ---------------------------------------------------------------------
create table public.cursos (
  id   smallint generated always as identity primary key,
  nome text not null unique check (nome = btrim(nome) and nome <> '')
);

create table public.categorias_evento (
  id   smallint generated always as identity primary key,
  nome text not null unique check (nome = btrim(nome) and nome <> '')  -- Coleta, Agrofloresta, PETS...
);

-- ---------------------------------------------------------------------
-- Participantes
-- Chave própria (uuid): há público externo e alunos sem RA, então RA não serve de PK.
-- ---------------------------------------------------------------------
create table public.participantes (
  id             uuid primary key default gen_random_uuid(),
  nome           text not null check (nome = btrim(nome) and nome <> ''),
  email          extensions.citext not null unique
                   check (email::text ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  ra             text unique check (ra ~ '^\d{5,6}$'),
  tipo           public.tipo_participante not null,
  curso_id       smallint references public.cursos (id),
  ano_ingresso   smallint check (ano_ingresso between 1966 and 2100),
  celular        text,
  idade          smallint check (idade between 10 and 120),   -- informada no cadastro
  genero         text,
  na_comunidade  boolean,                                       -- comunidade do WhatsApp
  observacoes    text,                                          -- uso da organização
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  constraint aluno_tem_ra check (tipo = 'externo' or ra is not null)
);

-- ---------------------------------------------------------------------
-- Eventos
-- perguntas: formulário de inscrição do evento, ex.
--   [{"id":"carona","rotulo":"Precisa de carona?","tipo":"sim_nao","obrigatoria":true},
--    {"id":"vagas","rotulo":"Quantas vagas oferece?","tipo":"numero"},
--    {"id":"turno","rotulo":"Turno","tipo":"opcao","opcoes":["Manhã","Tarde"]}]
--   tipos: texto | sim_nao | numero | opcao
-- ---------------------------------------------------------------------
create table public.eventos (
  id             bigint generated always as identity primary key,
  codigo_legado  text unique,        -- "Evento 55", "Evento 54.1", "Evento Extra UPA"...
  edicao         text,               -- "68ª Edição": informativo, NÃO é único no legado
  titulo         text not null check (titulo = btrim(titulo) and titulo <> ''),
  descricao      text,
  categoria_id   smallint references public.categorias_evento (id),
  local          text,
  inicio         timestamptz not null,
  horas          numeric(4,1) not null check (horas > 0),
  vagas          integer check (vagas > 0),
  inscricoes_ate timestamptz,
  status         public.status_evento not null default 'planejado',
  perguntas      jsonb not null default '[]' check (jsonb_typeof(perguntas) = 'array'),
  observacoes    text,               -- uso interno da organização
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);
create index eventos_inicio_idx on public.eventos (inicio);

-- ---------------------------------------------------------------------
-- Inscrições (substitui a matriz do "Controle de Horas")
-- ---------------------------------------------------------------------
create table public.inscricoes (
  id                      bigint generated always as identity primary key,
  participante_id         uuid   not null references public.participantes (id) on delete restrict,
  evento_id               bigint not null references public.eventos (id) on delete restrict,
  status                  public.status_inscricao not null default 'inscrito',
  origem                  text not null default 'plataforma'
                            check (origem in ('plataforma', 'forms_legado', 'planilha_legado', 'manual')),
  respostas               jsonb not null default '{}' check (jsonb_typeof(respostas) = 'object'),
  presenca_registrada_em  timestamptz,
  presenca_registrada_por uuid references auth.users (id),
  criado_em               timestamptz not null default now(),
  atualizado_em           timestamptz not null default now(),
  unique (participante_id, evento_id)
);
create index inscricoes_evento_idx on public.inscricoes (evento_id, status);

-- ---------------------------------------------------------------------
-- Ajustes manuais de horas (antes: "+3+8+5" escondido na fórmula)
-- ---------------------------------------------------------------------
create table public.ajustes_horas (
  id              bigint generated always as identity primary key,
  participante_id uuid not null references public.participantes (id) on delete restrict,
  horas           numeric(5,1) not null check (horas <> 0),
  motivo          text not null check (btrim(motivo) <> ''),
  criado_por      uuid references auth.users (id) default auth.uid(),
  criado_em       timestamptz not null default now()
);

create index ajustes_horas_participante_idx on public.ajustes_horas (participante_id);

-- ---------------------------------------------------------------------
-- Solicitações de validação de horas (antes: aba Historico + colunas D/E/F)
-- ---------------------------------------------------------------------
create table public.solicitacoes_validacao (
  id              bigint generated always as identity primary key,
  participante_id uuid not null references public.participantes (id) on delete restrict,
  horas           numeric(5,1) not null check (horas > 0),
  status          public.status_solicitacao not null default 'pendente',
  solicitado_em   timestamptz not null default now(),
  decidido_em     timestamptz,
  decidido_por    uuid references auth.users (id),
  observacao      text,
  constraint decisao_consistente check ((status = 'pendente') = (decidido_em is null))
);
-- No máximo uma solicitação pendente por participante (regra que hoje está no Apps Script).
create unique index uma_pendente_por_participante
  on public.solicitacoes_validacao (participante_id) where status = 'pendente';
create index solicitacoes_participante_idx on public.solicitacoes_validacao (participante_id);

-- ---------------------------------------------------------------------
-- Organização (papéis)
-- ---------------------------------------------------------------------
create table public.organizadores (
  user_id   uuid primary key references auth.users (id) on delete cascade,
  ra        text not null unique check (ra ~ '^\d{5,6}$'),
  nome      text not null check (btrim(nome) <> ''),
  cargo     text,                -- título na equipe (ex.: Capitã); informativo
  papel     text not null default 'organizador' check (papel in ('organizador', 'admin')),
  criado_em timestamptz not null default now()
);

-- Convite para virar organizador. A pessoa conclui no "Primeiro acesso" do site,
-- definindo a própria senha (ninguém precisa repassar senha).
create table public.convites_admin (
  ra         text primary key check (ra ~ '^\d{5,6}$'),
  nome       text not null check (btrim(nome) <> ''),
  cargo      text,
  papel      text not null default 'organizador' check (papel in ('organizador', 'admin')),
  criado_por uuid references auth.users (id) on delete set null default auth.uid(),
  criado_em  timestamptz not null default now(),
  expira_em  timestamptz not null default now() + interval '7 days',
  usado_em   timestamptz
);

create or replace function privado.is_organizador()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.organizadores where user_id = (select auth.uid()));
$$;

create or replace function privado.is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.organizadores
                 where user_id = (select auth.uid()) and papel = 'admin');
$$;

-- ---------------------------------------------------------------------
-- Contas da organização: só nascem de um convite válido
-- ---------------------------------------------------------------------
create or replace function privado.ra_do_email_admin(p_email text)
returns text language sql immutable set search_path = '' as $$
  select substring(lower(p_email) from '^admin\.(\d{5,6})@mutiroes\.invalid$');
$$;

-- Bloqueia qualquer cadastro no Auth que não seja um convite em aberto
-- (o cadastro público do Supabase fica ligado, mas não serve para nada sem convite).
create or replace function privado.antes_criar_usuario()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_ra text := privado.ra_do_email_admin(new.email);
begin
  if v_ra is null or not exists (
       select 1 from public.convites_admin
        where ra = v_ra and usado_em is null and expira_em > now()) then
    raise exception 'Cadastro não permitido: não há convite de administrador em aberto para este RA';
  end if;
  return new;
end $$;

create or replace function privado.depois_criar_usuario()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_conv public.convites_admin;
begin
  update public.convites_admin set usado_em = now()
   where ra = privado.ra_do_email_admin(new.email) and usado_em is null
  returning * into v_conv;
  insert into public.organizadores (user_id, ra, nome, cargo, papel)
  values (new.id, v_conv.ra, v_conv.nome, v_conv.cargo, v_conv.papel);
  return new;
end $$;

create trigger mutiroes_antes_criar_usuario before insert on auth.users
  for each row execute function privado.antes_criar_usuario();
create trigger mutiroes_depois_criar_usuario after insert on auth.users
  for each row execute function privado.depois_criar_usuario();

-- ---------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------
create or replace function public.tocar_atualizado_em()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.atualizado_em := now();
  return new;
end $$;

create trigger participantes_atualizado before update on public.participantes
  for each row execute function public.tocar_atualizado_em();
create trigger eventos_atualizado before update on public.eventos
  for each row execute function public.tocar_atualizado_em();
create trigger inscricoes_atualizado before update on public.inscricoes
  for each row execute function public.tocar_atualizado_em();

-- E-mail sempre minúsculo e nome sem espaços sobrando: buscas por e-mail não
-- dependem do operador do citext estar no search_path da API.
create or replace function privado.normalizar_participante()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.email := lower(btrim(new.email::text));
  new.nome  := regexp_replace(btrim(new.nome), '\s+', ' ', 'g');
  return new;
end $$;

create trigger participantes_normalizar before insert or update of email, nome on public.participantes
  for each row execute function privado.normalizar_participante();

-- Registra quem e quando marcou presença/ausência
create or replace function public.carimbar_presenca()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status in ('presente', 'ausente') and new.status is distinct from old.status then
    new.presenca_registrada_em  := coalesce(new.presenca_registrada_em, now());
    new.presenca_registrada_por := coalesce(new.presenca_registrada_por, (select auth.uid()));
  elsif new.status not in ('presente', 'ausente') then
    new.presenca_registrada_em  := null;
    new.presenca_registrada_por := null;
  end if;
  return new;
end $$;

create trigger inscricoes_presenca before update of status on public.inscricoes
  for each row execute function public.carimbar_presenca();

-- Registra quem e quando decidiu uma solicitação
create or replace function public.carimbar_decisao()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status <> 'pendente' and old.status = 'pendente' then
    new.decidido_em  := coalesce(new.decidido_em, now());
    new.decidido_por := coalesce(new.decidido_por, (select auth.uid()));
  end if;
  return new;
end $$;

create trigger solicitacoes_decisao before update of status on public.solicitacoes_validacao
  for each row execute function public.carimbar_decisao();

-- ---------------------------------------------------------------------
-- Saldo de horas (calculado — nunca armazenado)
--   disponiveis = acumuladas - validadas - pendentes
-- ---------------------------------------------------------------------
create view public.saldo_horas with (security_invoker = true) as
select
  p.id                                                as participante_id,
  coalesce(pr.h, 0) + coalesce(aj.h, 0)               as horas_acumuladas,
  coalesce(sv.validadas, 0)                           as horas_validadas,
  coalesce(sv.pendentes, 0)                           as horas_pendentes,
  coalesce(pr.h, 0) + coalesce(aj.h, 0)
    - coalesce(sv.validadas, 0) - coalesce(sv.pendentes, 0) as horas_disponiveis
from public.participantes p
left join lateral (
  select sum(e.horas) as h
  from public.inscricoes i join public.eventos e on e.id = i.evento_id
  where i.participante_id = p.id and i.status = 'presente'
) pr on true
left join lateral (
  select sum(a.horas) as h from public.ajustes_horas a where a.participante_id = p.id
) aj on true
left join lateral (
  select sum(s.horas) filter (where s.status = 'aprovada') as validadas,
         sum(s.horas) filter (where s.status = 'pendente') as pendentes
  from public.solicitacoes_validacao s where s.participante_id = p.id
) sv on true;

-- Contagens por evento (organização)
create view public.resumo_eventos with (security_invoker = true) as
select
  e.id as evento_id,
  count(i.id) filter (where i.status in ('inscrito', 'presente', 'ausente')) as inscritos,
  count(i.id) filter (where i.status = 'lista_espera') as lista_espera,
  count(i.id) filter (where i.status = 'sem_vaga')     as sem_vaga,
  count(i.id) filter (where i.status = 'presente')     as presentes,
  count(i.id) filter (where i.status = 'ausente')      as ausentes,
  count(i.id) filter (where i.status = 'cancelada')    as canceladas
from public.eventos e
left join public.inscricoes i on i.evento_id = e.id
group by e.id;

-- =====================================================================
-- RLS
-- =====================================================================
alter table public.cursos                 enable row level security;
alter table public.categorias_evento      enable row level security;
alter table public.participantes          enable row level security;
alter table public.eventos                enable row level security;
alter table public.inscricoes             enable row level security;
alter table public.ajustes_horas          enable row level security;
alter table public.solicitacoes_validacao enable row level security;
alter table public.organizadores          enable row level security;
alter table public.convites_admin         enable row level security;

-- Referências: leitura para todos; escrita só organização
create policy cursos_leitura on public.cursos for select to anon, authenticated using (true);
create policy cursos_org_inserir on public.cursos for insert to authenticated with check ((select privado.is_organizador()));
create policy cursos_org_alterar on public.cursos for update to authenticated using ((select privado.is_organizador())) with check ((select privado.is_organizador()));
create policy cursos_org_excluir on public.cursos for delete to authenticated using ((select privado.is_organizador()));

create policy categorias_leitura on public.categorias_evento for select to anon, authenticated using (true);
create policy categorias_org_inserir on public.categorias_evento for insert to authenticated with check ((select privado.is_organizador()));
create policy categorias_org_alterar on public.categorias_evento for update to authenticated using ((select privado.is_organizador())) with check ((select privado.is_organizador()));
create policy categorias_org_excluir on public.categorias_evento for delete to authenticated using ((select privado.is_organizador()));

-- Eventos: públicos depois de divulgados; organização vê e edita tudo
create policy eventos_leitura on public.eventos for select to anon, authenticated
  using (status <> 'planejado' or (select privado.is_organizador()));
create policy eventos_org_inserir on public.eventos for insert to authenticated with check ((select privado.is_organizador()));
create policy eventos_org_alterar on public.eventos for update to authenticated using ((select privado.is_organizador())) with check ((select privado.is_organizador()));
create policy eventos_org_excluir on public.eventos for delete to authenticated using ((select privado.is_organizador()));

-- Participantes, inscrições, ajustes e solicitações: tabelas só da organização.
-- Alunos acessam o que é seu pelas funções RPC por RA.
create policy participantes_leitura on public.participantes for select to authenticated
  using ((select privado.is_organizador()));
create policy participantes_org_inserir on public.participantes for insert to authenticated with check ((select privado.is_organizador()));
create policy participantes_org_alterar on public.participantes for update to authenticated using ((select privado.is_organizador())) with check ((select privado.is_organizador()));
create policy participantes_org_excluir on public.participantes for delete to authenticated using ((select privado.is_organizador()));

create policy inscricoes_leitura on public.inscricoes for select to authenticated
  using ((select privado.is_organizador()));
create policy inscricoes_org_inserir on public.inscricoes for insert to authenticated with check ((select privado.is_organizador()));
create policy inscricoes_org_alterar on public.inscricoes for update to authenticated using ((select privado.is_organizador())) with check ((select privado.is_organizador()));
create policy inscricoes_org_excluir on public.inscricoes for delete to authenticated using ((select privado.is_organizador()));

create policy ajustes_leitura on public.ajustes_horas for select to authenticated
  using ((select privado.is_organizador()));
create policy ajustes_org_inserir on public.ajustes_horas for insert to authenticated with check ((select privado.is_organizador()));
create policy ajustes_org_alterar on public.ajustes_horas for update to authenticated using ((select privado.is_organizador())) with check ((select privado.is_organizador()));
create policy ajustes_org_excluir on public.ajustes_horas for delete to authenticated using ((select privado.is_organizador()));

create policy solicitacoes_leitura on public.solicitacoes_validacao for select to authenticated
  using ((select privado.is_organizador()));
create policy solicitacoes_org_inserir on public.solicitacoes_validacao for insert to authenticated with check ((select privado.is_organizador()));
create policy solicitacoes_org_alterar on public.solicitacoes_validacao for update to authenticated using ((select privado.is_organizador())) with check ((select privado.is_organizador()));
create policy solicitacoes_org_excluir on public.solicitacoes_validacao for delete to authenticated using ((select privado.is_organizador()));

-- Organizadores: cada um vê o próprio papel (organização vê todos); só admin gerencia
create policy organizadores_leitura on public.organizadores for select to authenticated
  using (user_id = (select auth.uid()) or (select privado.is_organizador()));
create policy organizadores_admin_inserir on public.organizadores for insert to authenticated with check ((select privado.is_admin()));
create policy organizadores_admin_alterar on public.organizadores for update to authenticated using ((select privado.is_admin())) with check ((select privado.is_admin()));
create policy organizadores_admin_excluir on public.organizadores for delete to authenticated using ((select privado.is_admin()));

-- Convites: organização vê; só admin cria/altera/remove
create policy convites_leitura on public.convites_admin for select to authenticated using ((select privado.is_organizador()));
create policy convites_admin_inserir on public.convites_admin for insert to authenticated with check ((select privado.is_admin()));
create policy convites_admin_alterar on public.convites_admin for update to authenticated using ((select privado.is_admin())) with check ((select privado.is_admin()));
create policy convites_admin_excluir on public.convites_admin for delete to authenticated using ((select privado.is_admin()));

-- =====================================================================
-- GRANTs explícitos: desde out/2026 o Supabase não expõe tabelas novas
-- automaticamente na Data API. O RLS acima decide QUAIS linhas.
-- =====================================================================
grant usage on schema public to anon, authenticated, service_role;

grant select on public.eventos, public.cursos, public.categorias_evento to anon;

grant select, insert, update, delete on
  public.cursos, public.categorias_evento, public.participantes, public.eventos,
  public.inscricoes, public.ajustes_horas, public.solicitacoes_validacao, public.organizadores,
  public.convites_admin
  to authenticated, service_role;
grant select on public.saldo_horas, public.resumo_eventos to authenticated, service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;

-- Defesa em profundidade: projetos/stacks com privilégios padrão antigos concedem tudo
-- a anon/authenticated em tabelas novas. Tiramos explicitamente o que não deve existir:
-- o público só lê eventos/cursos/categorias (o resto passa pelas funções RPC), e
-- ninguém da API faz TRUNCATE/TRIGGER/REFERENCES (TRUNCATE ignora RLS).
revoke all on public.participantes, public.inscricoes, public.ajustes_horas,
  public.solicitacoes_validacao, public.organizadores, public.convites_admin,
  public.saldo_horas, public.resumo_eventos
  from anon;
revoke insert, update, delete on public.eventos, public.cursos, public.categorias_evento from anon;
revoke truncate, trigger, references on all tables in schema public from anon, authenticated;

revoke execute on all functions in schema privado from public;
grant execute on all functions in schema privado to anon, authenticated, service_role;
-- o servidor de login (GoTrue) roda como supabase_auth_admin e dispara os triggers de auth.users
grant usage on schema privado to supabase_auth_admin;
grant execute on function privado.antes_criar_usuario(), privado.depois_criar_usuario(),
  privado.ra_do_email_admin(text) to supabase_auth_admin;
