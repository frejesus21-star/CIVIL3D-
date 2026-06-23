const { test, before } = require('node:test');
const assert = require('node:assert');
const path = require('path');

// Base de datos temporal aislada para estos tests
process.env.DB_PATH = path.join('/tmp', `token-test-${Date.now()}.db`);
const db = require('../src/config/database');
const tokens = require('../src/services/tokenService');

const USER_ID = 'user-token-test';

before(async () => {
  await db.init();
  // Crea un usuario mínimo para asociar los tokens
  await db.prepare('INSERT INTO users (id,nombre,email,rut,password_hash) VALUES (?,?,?,?,?)')
    .run(USER_ID, 'Test', 'token@test.com', '111111111', 'x');
});

test('crear y consumir un token válido devuelve el user_id', async () => {
  const t = await tokens.crear(USER_ID, 'verificar_email', 60);
  assert.equal(await tokens.consumir('verificar_email', t), USER_ID);
});

test('un token no se puede consumir dos veces', async () => {
  const t = await tokens.crear(USER_ID, 'recuperar_password', 60);
  assert.equal(await tokens.consumir('recuperar_password', t), USER_ID);
  assert.equal(await tokens.consumir('recuperar_password', t), null);
});

test('un token de otro tipo no es válido', async () => {
  const t = await tokens.crear(USER_ID, 'verificar_email', 60);
  assert.equal(await tokens.consumir('recuperar_password', t), null);
});

test('un token expirado no es válido', async () => {
  const t = await tokens.crear(USER_ID, 'verificar_email', -1); // ya expirado
  assert.equal(await tokens.consumir('verificar_email', t), null);
});

test('crear un token nuevo invalida el anterior del mismo tipo', async () => {
  const viejo = await tokens.crear(USER_ID, 'recuperar_password', 60);
  const nuevo = await tokens.crear(USER_ID, 'recuperar_password', 60);
  assert.equal(await tokens.consumir('recuperar_password', viejo), null);
  assert.equal(await tokens.consumir('recuperar_password', nuevo), USER_ID);
});

test('tokens inválidos o vacíos devuelven null', async () => {
  assert.equal(await tokens.consumir('verificar_email', 'inexistente'), null);
  assert.equal(await tokens.consumir('verificar_email', ''), null);
  assert.equal(await tokens.consumir('verificar_email', null), null);
});
