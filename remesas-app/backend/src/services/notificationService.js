const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');

// Crea una notificación in-app. En producción aquí se dispararía también email/SMS/push.
function crear(userId, { tipo = 'info', titulo, mensaje, meta = null }) {
  const id = uuidv4();
  db.prepare(`
    INSERT INTO notificaciones (id, user_id, tipo, titulo, mensaje, meta)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, userId, tipo, titulo, mensaje, meta ? JSON.stringify(meta) : null);
  return id;
}

function listar(userId, soloNoLeidas = false) {
  const where = soloNoLeidas ? 'AND leida = 0' : '';
  return db.prepare(`
    SELECT * FROM notificaciones
    WHERE user_id = ? ${where}
    ORDER BY created_at DESC LIMIT 50
  `).all(userId).map(n => ({ ...n, meta: n.meta ? JSON.parse(n.meta) : null, leida: !!n.leida }));
}

function contarNoLeidas(userId) {
  return db.prepare('SELECT COUNT(*) AS n FROM notificaciones WHERE user_id = ? AND leida = 0').get(userId).n;
}

function marcarLeida(userId, id) {
  return db.prepare('UPDATE notificaciones SET leida = 1 WHERE id = ? AND user_id = ?').run(id, userId).changes;
}

function marcarTodasLeidas(userId) {
  return db.prepare('UPDATE notificaciones SET leida = 1 WHERE user_id = ?').run(userId).changes;
}

module.exports = { crear, listar, contarNoLeidas, marcarLeida, marcarTodasLeidas };
