#!/usr/bin/env bash
# Testa as chamadas do site contra o Supabase LOCAL (com Auth real), com os dados importados.
# Uso (na raiz do repositório):
#   npx supabase start
#   bash supabase/tests/api/run_api.sh /caminho/para/Data
# ATENÇÃO: recria o banco local (db reset) antes e depois do teste.
set -euo pipefail
cd "$(dirname "$0")/../../.."
DATA="${1:?informe a pasta Data}"
CLI=(npx -y supabase@3.0.0)
PG=$(docker ps --filter label=com.supabase.cli.project=mutiroes --filter name=supabase_db --format '{{.Names}}')
eval "$("${CLI[@]}" status -o env 2>/dev/null | grep -E '^(API_URL|PUBLISHABLE_KEY)=')"

preparar() {
  "${CLI[@]}" db reset >/dev/null 2>&1
  docker exec -i "$PG" psql -U postgres -q -v ON_ERROR_STOP=1 < "$DATA/saida/importacao.sql" 2>&1 | grep -i "conferência" || true
}
preparar
# um aluno importado com presença (RA/e-mail só vão para o script, não são impressos)
read -r RA EMAIL < <(docker exec "$PG" psql -U postgres -At -F ' ' -c \
  "select ra, email from participantes p where ra is not null and exists (select 1 from inscricoes i where i.participante_id=p.id and i.status='presente') order by id limit 1")
status=0
node supabase/tests/api/api_test.cjs "$PWD/site" "$API_URL" "$PUBLISHABLE_KEY" "$RA" "$EMAIL" "$PG" || status=$?
echo ">> limpando: recriando banco local com os dados importados"
preparar
exit $status
