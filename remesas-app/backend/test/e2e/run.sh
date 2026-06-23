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
export DB_PATH="$DIR/data/e2e-test.db"

# Base de datos limpia para la corrida
rm -f "$DB_PATH" "$DB_PATH"-* 2>/dev/null

node src/index.js > /tmp/e2e-server.log 2>&1 &
SERVER_PID=$!

cleanup() {
  kill "$SERVER_PID" 2>/dev/null
  rm -f "$DB_PATH" "$DB_PATH"-* 2>/dev/null
}
trap cleanup EXIT

# Espera a que el servidor responda (máx ~10s)
for i in $(seq 1 20); do
  if curl -s -o /dev/null "http://localhost:$PORT/api/tasas"; then break; fi
  sleep 0.5
done

node test/e2e/integration.js
exit $?
