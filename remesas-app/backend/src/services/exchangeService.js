const fetch = require('node-fetch');
const db = require('../config/database');
const { getConfig } = require('../config/database');

async function getComisionPct() {
  const val = await getConfig('comision_pct');
  const n = parseFloat(val);
  return (!isNaN(n) && n >= 0 && n <= 100) ? n : 2.5;
}

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 min

// Tasas de respaldo configurables por entorno. Sirven cuando las APIs externas
// no están disponibles, para que el servicio nunca quede completamente caído.
// IMPORTANTE: un admin debe mantenerlas actualizadas (especialmente VES por la inflación).
const FALLBACK_USD_CLP = parseFloat(process.env.FALLBACK_USD_CLP || '950');
const FALLBACK_USD_VES = parseFloat(process.env.FALLBACK_USD_VES || '45');

async function fetchParaleloDolar() {
  // Monitor Dólar Venezuela API (promedio)
  const res = await fetch('https://ve.dolarapi.com/v1/dolares/promedio', {
    headers: { 'Accept': 'application/json' },
    timeout: 8000,
  });
  if (!res.ok) throw new Error(`dolarapi error: ${res.status}`);
  const data = await res.json();
  return parseFloat(data.promedio);
}

async function fetchUsdClp() {
  // ExchangeRate-API free endpoint
  const res = await fetch('https://open.er-api.com/v6/latest/USD', {
    timeout: 8000,
  });
  if (!res.ok) throw new Error(`er-api error: ${res.status}`);
  const data = await res.json();
  return parseFloat(data.rates.CLP);
}

async function getRates() {
  const cached = await db.prepare('SELECT * FROM tasas_cache ORDER BY id DESC LIMIT 1').get();
  const now = Date.now();

  if (cached && (now - new Date(cached.updated_at).getTime()) < CACHE_TTL_MS) {
    return { usd_clp: cached.usd_clp, usd_ves: cached.usd_ves, fuente: cached.fuente, cached: true };
  }

  try {
    const [usd_ves, usd_clp] = await Promise.all([fetchParaleloDolar(), fetchUsdClp()]);

    await db.prepare(`
      INSERT INTO tasas_cache (usd_clp, usd_ves, fuente, updated_at)
      VALUES (?, ?, 'dolarapi+openexchange', CURRENT_TIMESTAMP)
    `).run(usd_clp, usd_ves);

    return { usd_clp, usd_ves, fuente: 'dolarapi+openexchange', cached: false };
  } catch (err) {
    // 1º fallback: caché aunque esté vencido
    if (cached) {
      return { usd_clp: cached.usd_clp, usd_ves: cached.usd_ves, fuente: cached.fuente + ' (caché vencido)', cached: true };
    }
    // 2º fallback: tasa de respaldo configurada, para no dejar el servicio caído
    return {
      usd_clp: FALLBACK_USD_CLP,
      usd_ves: FALLBACK_USD_VES,
      fuente: 'tasa de respaldo (APIs no disponibles)',
      cached: false,
      respaldo: true,
    };
  }
}

function calcularTransferencia(monto_clp, rates, comision_pct = 2.5) {
  const comision_clp = monto_clp * (comision_pct / 100);
  const monto_neto_clp = monto_clp - comision_clp;
  const monto_usd = monto_neto_clp / rates.usd_clp;
  const monto_ves = monto_usd * rates.usd_ves;
  return {
    monto_clp,
    comision_clp: Math.round(comision_clp),
    monto_neto_clp: Math.round(monto_neto_clp),
    monto_usd: Math.round(monto_usd * 100) / 100,
    monto_ves: Math.round(monto_ves),
    tasa_usd_clp: rates.usd_clp,
    tasa_usd_ves: rates.usd_ves,
    comision_pct,
  };
}

// Cotización inversa: dado cuánto debe LLEGAR en Bs., calcula cuánto pagar en CLP
function calcularInverso(monto_ves, rates, comision_pct = 2.5) {
  const monto_usd = monto_ves / rates.usd_ves;
  const monto_neto_clp = monto_usd * rates.usd_clp;
  // monto_neto = monto_clp * (1 - comision_pct/100)  =>  monto_clp = monto_neto / (1 - c)
  const monto_clp = monto_neto_clp / (1 - comision_pct / 100);
  return calcularTransferencia(Math.round(monto_clp), rates, comision_pct);
}

// Permite al admin invalidar el caché manualmente
let _cacheInvalidated = false;
function clearCache() { _cacheInvalidated = true; }

const _origGetRates = getRates;
async function getRatesWithInvalidation() {
  if (_cacheInvalidated) {
    _cacheInvalidated = false;
    await db.prepare('DELETE FROM tasas_cache WHERE manual = 0').run();
  }
  return _origGetRates();
}

module.exports = { getRates: getRatesWithInvalidation, calcularTransferencia, calcularInverso, clearCache, getComisionPct };
