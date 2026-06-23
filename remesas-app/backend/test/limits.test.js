const { test } = require('node:test');
const assert = require('node:assert');

// Usar una DB temporal aislada para no tocar datos de desarrollo
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'remesas-test-'));
process.env.DB_DIR = tmpDir; // (database.js usa ruta fija; este test solo usa funciones puras + uso=0)

const { NIVELES, getLimites, validarEnvio } = require('../src/services/limitsService');

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

test('validarEnvio rechaza monto sobre el máximo por transacción (nivel 1)', () => {
  const user = { id: '00000000-test-no-existe', kyc_nivel: 1 };
  const r = validarEnvio(user, 200000); // > 150000
  assert.equal(r.ok, false);
  assert.match(r.error, /transacción/i);
});

test('validarEnvio acepta monto dentro del límite (usuario sin uso previo)', () => {
  const user = { id: '00000000-test-no-existe', kyc_nivel: 1 };
  const r = validarEnvio(user, 100000); // < 150000 y sin uso previo
  assert.equal(r.ok, true);
});

test('validarEnvio permite montos mayores en nivel verificado', () => {
  const user = { id: '00000000-test-no-existe-2', kyc_nivel: 2 };
  assert.equal(validarEnvio(user, 200000).ok, true); // ok en nivel 2
  assert.equal(validarEnvio(user, 2000000).ok, false); // > 1.5M por transacción
});
