const { randomUUID } = require('crypto');
const db = require('../config/database');

// Registra una acción administrativa para trazabilidad / cumplimiento.
// No lanza errores: la auditoría nunca debe romper la operación principal.
function registrar(req, { accion, entidad = null, entidad_id = null, detalle = null }) {
  try {
    const admin = db.prepare('SELECT nombre FROM users WHERE id=?').get(req.userId);
    db.prepare(
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

function listar({ page = 1, limit = 30 } = {}) {
  const offset = (page - 1) * limit;
  const total = db.prepare('SELECT COUNT(*) as n FROM admin_log').get().n;
  const rows = db.prepare(
    'SELECT * FROM admin_log ORDER BY created_at DESC LIMIT ? OFFSET ?'
  ).all(limit, offset);
  return { rows, total, pages: Math.ceil(total / limit), page };
}

module.exports = { registrar, listar };
