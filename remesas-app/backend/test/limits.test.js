const { test, before } = require('node:test');
const assert = require('node:assert');

// Usar una DB temporal aislada para no tocar datos de desarrollo
const path = require('node:path');
process.env.DB_PATH = path.join('/tmp', `limits-test-${Date.now()}.db`);

const db = require('../src/config/database');
const { NIVELES, getLimites, validarEnvio } = require('../src/services/limitsService');

before(async () => { await db.init(); });

test('niveles definidos con perfil conservador', () => {
  assert.equal(NIVELES[1].diario, 150000);
  assert.equal(NIVELES[1].mensual, 500000);
  assert.equal(NIVELES[2].diario, 1500000);
  assert.equal(NIVELES[2].mensual, 5000000);
});

test('getLimites devuelve nivel 1 por defecto ante nivel desconocido', () => {
  assert.equal(getLimites(99).nombre, 'Básico');
  assert.equal(getLimites(undefined).nombre, 'Básico');
  assert.equal(getLimites(2).nombre, 'Verificado');
});

test('validarEnvio rechaza monto sobre el máximo por transacción (nivel 1)', async () => {
  const user = { id: '00000000-test-no-existe', kyc_nivel: 1 };
  const r = await validarEnvio(user, 200000); // > 150000
  assert.equal(r.ok, false);
  assert.match(r.error, /transacción/i);
});

test('validarEnvio acepta monto dentro del límite (usuario sin uso previo)', async () => {
  const user = { id: '00000000-test-no-existe', kyc_nivel: 1 };
  const r = await validarEnvio(user, 100000); // < 150000 y sin uso previo
  assert.equal(r.ok, true);
});

test('validarEnvio permite montos mayores en nivel verificado', async () => {
  const user = { id: '00000000-test-no-existe-2', kyc_nivel: 2 };
  assert.equal((await validarEnvio(user, 200000)).ok, true); // ok en nivel 2
  assert.equal((await validarEnvio(user, 2000000)).ok, false); // > 1.5M por transacción
});
