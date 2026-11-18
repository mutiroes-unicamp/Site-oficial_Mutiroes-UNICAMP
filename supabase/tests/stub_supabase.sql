-- Stub mínimo do que o Supabase já fornece (auth, papéis, schema extensions). Só para testes locais.
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create schema extensions;
create table auth.users (id uuid primary key, email text);
-- mesmas definições do Supabase: aceitam o formato antigo (claim.sub) e o do PostgREST atual (claims)
create function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                  (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim', true), ''),
                  nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
grant usage on schema public, auth, extensions to anon, authenticated;
grant execute on all functions in schema auth to anon, authenticated;
