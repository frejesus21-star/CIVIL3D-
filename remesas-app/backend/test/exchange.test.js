const { test } = require('node:test');
const assert = require('node:assert');
const { calcularTransferencia, calcularInverso } = require('../src/services/exchangeService');

const RATES = { usd_clp: 950, usd_ves: 45 };

test('calcularTransferencia aplica comisión del 2.5%', () => {
  const c = calcularTransferencia(100000, RATES);
  assert.equal(c.comision_clp, 2500);
  assert.equal(c.monto_neto_clp, 97500);
  assert.equal(c.comision_pct, 2.5);
});

test('calcularTransferencia convierte CLP -> USD -> VES', () => {
  const c = calcularTransferencia(100000, RATES);
  // neto 97500 / 950 = 102.63 USD
  assert.ok(Math.abs(c.monto_usd - 102.63) < 0.1, `USD esperado ~102.63, got ${c.monto_usd}`);
  // 102.63 * 45 = 4618 Bs aprox
  assert.ok(Math.abs(c.monto_ves - 4618) < 5, `VES esperado ~4618, got ${c.monto_ves}`);
});

test('calcularInverso es consistente con calcularTransferencia (ida y vuelta)', () => {
  // Si quiero que lleguen X Bs, ¿cuánto pago? Luego ese pago debe producir ~X Bs
  const objetivoVes = 5000;
  const inverso = calcularInverso(objetivoVes, RATES);
  const ida = calcularTransferencia(inverso.monto_clp, RATES);
  // El VES resultante debe estar muy cerca del objetivo (tolerancia por redondeo)
  assert.ok(Math.abs(ida.monto_ves - objetivoVes) <= 10, `esperado ~${objetivoVes}, got ${ida.monto_ves}`);
});

test('calcularTransferencia preserva el monto enviado', () => {
  const c = calcularTransferencia(73500, RATES);
  assert.equal(c.monto_clp, 73500);
});

test('comisión configurable', () => {
  const c = calcularTransferencia(100000, RATES, 5);
  assert.equal(c.comision_clp, 5000);
  assert.equal(c.monto_neto_clp, 95000);
});

test('montos siempre redondeados a enteros (CLP y VES)', () => {
  const c = calcularTransferencia(33333, RATES);
  assert.equal(c.comision_clp, Math.round(c.comision_clp));
  assert.equal(c.monto_ves, Math.round(c.monto_ves));
  assert.equal(c.monto_neto_clp, Math.round(c.monto_neto_clp));
});
