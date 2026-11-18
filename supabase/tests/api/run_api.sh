#!/usr/bin/env bash
# Uso: bash supabase/tests/api/run_api.sh "$PWD" /caminho/para/Data   (requer Docker, Node e Data/saida/importacao.sql gerado)
# Postgres + PostgREST descartáveis, com migrations + importação real; roda api_test.cjs.
set -euo pipefail
REPO="$1"; DATA="$2"; HERE="$(cd "$(dirname "$0")" && pwd)"
NET=mutiroes-net; PG=mutiroes-pgapi; RST=mutiroes-rest
cleanup() { docker rm -f $PG $RST >/dev/null 2>&1 || true; docker network rm $NET >/dev/null 2>&1 || true; }
cleanup; trap cleanup EXIT
docker network create $NET >/dev/null
docker run -d --rm --name $PG --network $NET -e POSTGRES_PASSWORD=x postgres:17 >/dev/null
until docker exec $PG pg_isready -U postgres -q 2>/dev/null; do sleep 1; done; sleep 2
P=(docker exec -i $PG psql -U postgres -q -v ON_ERROR_STOP=1)
"${P[@]}" < "$REPO/supabase/tests/stub_supabase.sql"
"${P[@]}" -c "create role authenticator login password 'x' noinherit; grant anon, authenticated, service_role to authenticator;"
for f in "$REPO"/supabase/migrations/*.sql; do "${P[@]}" -1 < "$f"; done
"${P[@]}" < "$DATA/saida/importacao.sql" 2>&1 | grep -i "conferência" || true
# admin fictício + um aluno real importado (só o id/e-mail vão para o JWT local; nada é impresso)
read -r ALU_EMAIL < <("${P[@]}" -At -c "select email from participantes p where exists (select 1 from inscricoes i where i.participante_id=p.id and i.status='presente') and exists (select 1 from saldo_horas s where s.participante_id=p.id and s.horas_disponiveis>0) and ra is not null order by id limit 1")
"${P[@]}" -c "insert into auth.users values ('00000000-0000-0000-0000-00000000000a','admin-teste@example.com'), ('00000000-0000-0000-0000-0000000000a1', '$ALU_EMAIL'); insert into public.organizadores values ('00000000-0000-0000-0000-00000000000a','admin');"
docker run -d --rm --name $RST --network $NET -p 127.0.0.1:3999:3000 \
  -e PGRST_DB_URI="postgres://authenticator:x@$PG:5432/postgres" -e PGRST_DB_SCHEMAS=public \
  -e PGRST_DB_ANON_ROLE=anon -e PGRST_JWT_SECRET='segredo-de-teste-com-mais-de-32-caracteres!!' postgrest/postgrest:v12.2.3 >/dev/null
for i in $(seq 1 30); do curl -sf -o /dev/null http://127.0.0.1:3999/ && break; sleep 1; done
node "$HERE/api_test.cjs" "$REPO/site" "00000000-0000-0000-0000-00000000000a,admin-teste@example.com" "00000000-0000-0000-0000-0000000000a1,$ALU_EMAIL"
