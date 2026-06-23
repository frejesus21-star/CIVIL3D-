const { test } = require('node:test');
const assert = require('node:assert');
const totp = require('../src/utils/totp');

// Vectores oficiales del RFC 6238 (secreto ASCII "12345678901234567890")
const SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

test('TOTP coincide con los vectores del RFC 6238', () => {
  assert.equal(totp.generarCodigo(SECRET, 1), '287082');
  assert.equal(totp.generarCodigo(SECRET, 37037036), '081804');
});

test('verificar acepta el código del momento actual', () => {
  const s = totp.generarSecreto();
  const code = totp.generarCodigo(s, Math.floor(Date.now() / 1000 / 30));
  assert.equal(totp.verificar(s, code), true);
});

test('verificar tolera ±1 ventana de tiempo', () => {
  const s = totp.generarSecreto();
  const c = Math.floor(Date.now() / 1000 / 30);
  assert.equal(totp.verificar(s, totp.generarCodigo(s, c - 1)), true);
  assert.equal(totp.verificar(s, totp.generarCodigo(s, c + 1)), true);
});

test('verificar rechaza códigos inválidos y mal formados', () => {
  const s = totp.generarSecreto();
  assert.equal(totp.verificar(s, '000000'), false);
  assert.equal(totp.verificar(s, 'abc'), false);
  assert.equal(totp.verificar(s, ''), false);
  assert.equal(totp.verificar(s, null), false);
});

test('generarSecreto produce base32 de 32 caracteres', () => {
  const s = totp.generarSecreto();
  assert.match(s, /^[A-Z2-7]{32}$/);
});

test('otpauthURI incluye secreto y emisor', () => {
  const uri = totp.otpauthURI('ABC234', 'ana@test.com');
  assert.ok(uri.startsWith('otpauth://totp/'));
  assert.ok(uri.includes('secret=ABC234'));
  assert.ok(uri.includes('issuer=RemesasVE'));
});
