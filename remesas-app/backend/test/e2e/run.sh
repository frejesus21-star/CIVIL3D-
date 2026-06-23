#!/bin/bash
# Levanta el backend con una base de datos temporal, ejecuta la prueba de
# integración end-to-end y limpia todo al terminar.
#
# Uso:  bash test/e2e/run.sh
set -u

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$DIR"

export PORT=4099
export JWT_SECRET=e2e_secret_local
export ADMIN_SEED_SECRET=e2e_seed_secret
export FALLBACK_USD_CLP=950
export FALLBACK_USD_VES=45

# Si DATABASE_URL está definida, la prueba corre contra PostgreSQL (esquema
# limpio); si no, usa una base SQLite temporal.
if [ -n "${DATABASE_URL:-}" ]; then
  echo "→ e2e sobre PostgreSQL"
  psql "$DATABASE_URL" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;" >/dev/null 2>&1
else
  export DB_PATH="$DIR/data/e2e-test.db"
  rm -f "$DB_PATH" "$DB_PATH"-* 2>/dev/null
fi

node src/index.js > /tmp/e2e-server.log 2>&1 &
SERVER_PID=$!

cleanup() {
  kill "$SERVER_PID" 2>/dev/null
  [ -n "${DB_PATH:-}" ] && rm -f "$DB_PATH" "$DB_PATH"-* 2>/dev/null
}
trap cleanup EXIT

# Espera a que el servidor responda (máx ~10s)
for i in $(seq 1 20); do
  if curl -s -o /dev/null "http://localhost:$PORT/api/tasas"; then break; fi
  sleep 0.5
done

node test/e2e/integration.js
exit $?
