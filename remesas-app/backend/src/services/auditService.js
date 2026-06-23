const { randomUUID } = require('crypto');
const db = require('../config/database');

// Registra una acción administrativa para trazabilidad / cumplimiento.
// No lanza errores: la auditoría nunca debe romper la operación principal.
async function registrar(req, { accion, entidad = null, entidad_id = null, detalle = null }) {
  try {
    const admin = await db.prepare('SELECT nombre FROM users WHERE id=?').get(req.userId);
    await db.prepare(
      'INSERT INTO admin_log (id, admin_id, admin_nombre, accion, entidad, entidad_id, detalle) VALUES (?,?,?,?,?,?,?)'
    ).run(
      randomUUID(),
      req.userId,
      admin ? admin.nombre : null,
      accion,
      entidad,
      entidad_id,
      detalle ? (typeof detalle === 'string' ? detalle : JSON.stringify(detalle)) : null
    );
  } catch (e) {
    // Silencioso a propósito
  }
}

async function listar({ page = 1, limit = 30, accion = null, desde = null, hasta = null } = {}) {
  const offset = (page - 1) * limit;
  const cond = [];
  const params = [];
  if (accion) { cond.push('accion = ?'); params.push(accion); }
  if (desde) { cond.push('DATE(created_at) >= DATE(?)'); params.push(desde); }
  if (hasta) { cond.push('DATE(created_at) <= DATE(?)'); params.push(hasta); }
  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';

  const total = (await db.prepare(`SELECT COUNT(*) as n FROM admin_log ${where}`).get(...params)).n;
  const rows = await db.prepare(
    `SELECT * FROM admin_log ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ).all(...params, limit, offset);
  return { rows, total, pages: Math.ceil(total / limit), page };
}

module.exports = { registrar, listar };
