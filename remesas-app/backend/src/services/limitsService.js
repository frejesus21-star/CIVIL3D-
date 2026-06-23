const db = require('../config/database');

// Límites de envío por nivel KYC (montos en CLP) — perfil conservador
const NIVELES = {
  1: { nombre: 'Básico', diario: 150000, mensual: 500000, por_transaccion: 150000 },
  2: { nombre: 'Verificado', diario: 1500000, mensual: 5000000, por_transaccion: 1500000 },
};

function getLimites(nivel) {
  return NIVELES[nivel] || NIVELES[1];
}

// Uso acumulado del usuario (transferencias no fallidas/canceladas) en UTC
function getUso(userId) {
  const hoy = db.prepare(`
    SELECT COALESCE(SUM(monto_clp),0) AS total
    FROM transferencias
    WHERE user_id = ? AND estado NOT IN ('fallida','cancelada')
      AND date(created_at) = date('now')
  `).get(userId).total;

  const mes = db.prepare(`
    SELECT COALESCE(SUM(monto_clp),0) AS total
    FROM transferencias
    WHERE user_id = ? AND estado NOT IN ('fallida','cancelada')
      AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')
  `).get(userId).total;

  return { hoy, mes };
}

function getResumen(user) {
  const limites = getLimites(user.kyc_nivel);
  const uso = getUso(user.id);
  return {
    nivel: user.kyc_nivel,
    nivel_nombre: limites.nombre,
    kyc_estado: user.kyc_estado,
    limites,
    uso,
    disponible_hoy: Math.max(0, limites.diario - uso.hoy),
    disponible_mes: Math.max(0, limites.mensual - uso.mes),
  };
}

// Valida si el usuario puede enviar `monto`. Devuelve { ok, error }
function validarEnvio(user, monto) {
  const limites = getLimites(user.kyc_nivel);
  const uso = getUso(user.id);

  if (monto > limites.por_transaccion) {
    return { ok: false, error: `El máximo por transacción en tu nivel (${limites.nombre}) es $${limites.por_transaccion.toLocaleString('es-CL')} CLP. Verifica tu identidad para aumentarlo.` };
  }
  if (uso.hoy + monto > limites.diario) {
    return { ok: false, error: `Superas tu límite diario de $${limites.diario.toLocaleString('es-CL')} CLP. Disponible hoy: $${Math.max(0, limites.diario - uso.hoy).toLocaleString('es-CL')} CLP.` };
  }
  if (uso.mes + monto > limites.mensual) {
    return { ok: false, error: `Superas tu límite mensual de $${limites.mensual.toLocaleString('es-CL')} CLP. Disponible este mes: $${Math.max(0, limites.mensual - uso.mes).toLocaleString('es-CL')} CLP.` };
  }
  return { ok: true };
}

module.exports = { NIVELES, getLimites, getUso, getResumen, validarEnvio };
