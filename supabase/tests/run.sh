#!/usr/bin/env bash
# Sobe um Postgres 17 descartável, aplica stub + migrations e roda o teste de fumaça.
# Uso: bash supabase/tests/run.sh   (requer Docker)
set -euo pipefail
cd "$(dirname "$0")/../.."
NAME=mutiroes-pgtest
docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --rm --name "$NAME" -e POSTGRES_PASSWORD=x postgres:17 >/dev/null
trap 'docker stop "$NAME" >/dev/null' EXIT
until docker exec "$NAME" pg_isready -U postgres -q 2>/dev/null; do sleep 1; done
sleep 2
PSQL=(docker exec -i "$NAME" psql -U postgres -q -v ON_ERROR_STOP=1)
"${PSQL[@]}" < supabase/tests/stub_supabase.sql
for f in supabase/migrations/*.sql; do
  echo ">> $f"; "${PSQL[@]}" -1 < "$f"
done
echo ">> migrations OK"
docker exec -i "$NAME" psql -U postgres -q < supabase/tests/rls_smoke.sql 2>&1
