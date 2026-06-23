const fetch = require('node-fetch');
const db = require('../config/database');

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 min

async function fetchParaleloDolar() {
  // Monitor Dólar Venezuela API (paralelo)
  const res = await fetch('https://ve.dolarapi.com/v1/dolares/paralelo', {
    headers: { 'Accept': 'application/json' },
    timeout: 8000,
  });
  if (!res.ok) throw new Error(`dolarapi error: ${res.status}`);
  const data = await res.json();
  // data.promedio = tasa paralelo VES por 1 USD
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
  const cached = db.prepare('SELECT * FROM tasas_cache ORDER BY id DESC LIMIT 1').get();
  const now = Date.now();

  if (cached && (now - new Date(cached.updated_at).getTime()) < CACHE_TTL_MS) {
    return { usd_clp: cached.usd_clp, usd_ves: cached.usd_ves, fuente: cached.fuente, cached: true };
  }

  try {
    const [usd_ves, usd_clp] = await Promise.all([fetchParaleloDolar(), fetchUsdClp()]);

    db.prepare(`
      INSERT INTO tasas_cache (usd_clp, usd_ves, fuente, updated_at)
      VALUES (?, ?, 'dolarapi+openexchange', CURRENT_TIMESTAMP)
    `).run(usd_clp, usd_ves);

    return { usd_clp, usd_ves, fuente: 'dolarapi+openexchange', cached: false };
  } catch (err) {
    // Fallback al caché aunque esté vencido
    if (cached) {
      return { usd_clp: cached.usd_clp, usd_ves: cached.usd_ves, fuente: cached.fuente + ' (caché vencido)', cached: true };
    }
    throw new Error('No se pudo obtener la tasa de cambio: ' + err.message);
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

module.exports = { getRates, calcularTransferencia };
