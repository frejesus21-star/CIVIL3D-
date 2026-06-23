const { test } = require('node:test');
const assert = require('node:assert');
const {
  validarRut, limpiarRut, validarCedulaVE, validarTelefonoPM, validarEmail, esMayorDeEdad,
} = require('../src/utils/validators');

test('validarRut acepta RUTs válidos', () => {
  assert.equal(validarRut('11.111.111-1'), true);
  assert.equal(validarRut('12.345.678-5'), true);
  assert.equal(validarRut('5.126.663-3'), true);
  assert.equal(validarRut('111111111'), true); // sin formato
});

test('validarRut rechaza RUTs inválidos', () => {
  assert.equal(validarRut('12.345.678-9'), false); // DV incorrecto
  assert.equal(validarRut('1'), false);
  assert.equal(validarRut(''), false);
  assert.equal(validarRut('abc'), false);
});

test('validarRut maneja dígito verificador K', () => {
  // 1.000.005-K tiene DV = K (módulo 11)
  assert.equal(validarRut('1.000.005-K'), true);
  assert.equal(validarRut('1.000.005-0'), false);
  // 44.444.444 tiene DV = 4, no K
  assert.equal(validarRut('44.444.444-4'), true);
  assert.equal(validarRut('44.444.444-K'), false);
});

test('limpiarRut normaliza formato', () => {
  assert.equal(limpiarRut('12.345.678-5'), '123456785');
  assert.equal(limpiarRut('12345678-k'), '12345678K');
});

test('validarCedulaVE acepta cédulas venezolanas', () => {
  assert.equal(validarCedulaVE('V12345678'), true);
  assert.equal(validarCedulaVE('E12345678'), true);
  assert.equal(validarCedulaVE('V-12.345.678'), true);
  assert.equal(validarCedulaVE('v123456'), true);
});

test('validarCedulaVE rechaza formatos inválidos', () => {
  assert.equal(validarCedulaVE('X12345678'), false);
  assert.equal(validarCedulaVE('12345678'), false);
  assert.equal(validarCedulaVE('V123'), false); // muy corta
  assert.equal(validarCedulaVE(''), false);
});

test('validarTelefonoPM acepta prefijos válidos', () => {
  for (const pref of ['0412', '0414', '0416', '0424', '0426']) {
    assert.equal(validarTelefonoPM(pref + '1234567'), true, `prefijo ${pref}`);
  }
  assert.equal(validarTelefonoPM('0414-123.45.67'), true);
});

test('validarTelefonoPM rechaza prefijos y longitudes inválidas', () => {
  assert.equal(validarTelefonoPM('0400123456'), false); // prefijo inválido
  assert.equal(validarTelefonoPM('041412345'), false);  // corto
  assert.equal(validarTelefonoPM('04141234567890'), false); // largo
  assert.equal(validarTelefonoPM(''), false);
});

test('validarEmail funciona', () => {
  assert.equal(validarEmail('a@b.cl'), true);
  assert.equal(validarEmail('juan.perez@test.com'), true);
  assert.equal(validarEmail('sin-arroba.cl'), false);
  assert.equal(validarEmail('a@b'), false);
});

test('esMayorDeEdad valida 18 años', () => {
  const hoy = new Date();
  const hace18 = new Date(hoy.getFullYear() - 18, hoy.getMonth(), hoy.getDate()).toISOString().slice(0, 10);
  const hace17 = new Date(hoy.getFullYear() - 17, hoy.getMonth(), hoy.getDate()).toISOString().slice(0, 10);
  assert.equal(esMayorDeEdad(hace18), true);
  assert.equal(esMayorDeEdad(hace17), false);
  assert.equal(esMayorDeEdad('2010-01-01'), false);
  assert.equal(esMayorDeEdad(''), false);
});
