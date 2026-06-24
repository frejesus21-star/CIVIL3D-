const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');

// Crea una notificación in-app. En producción aquí se dispararía también email/SMS/push.
// No rechaza nunca: se invoca muchas veces sin await (fire-and-forget) y un
// fallo de notificación no debe tumbar la operación principal ni el proceso.
async function crear(userId, { tipo = 'info', titulo, mensaje, meta = null }) {
  const id = uuidv4();
  try {
    await db.prepare(`
      INSERT INTO notificaciones (id, user_id, tipo, titulo, mensaje, meta)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, userId, tipo, titulo, mensaje, meta ? JSON.stringify(meta) : null);
  } catch (e) {
    console.error('[notif:error]', e.message);
  }
  return id;
}

async function listar(userId, soloNoLeidas = false) {
  const where = soloNoLeidas ? 'AND leida = 0' : '';
  const filas = await db.prepare(`
    SELECT * FROM notificaciones
    WHERE user_id = ? ${where}
    ORDER BY created_at DESC LIMIT 50
  `).all(userId);
  return filas.map(n => ({ ...n, meta: n.meta ? JSON.parse(n.meta) : null, leida: !!n.leida }));
}

async function contarNoLeidas(userId) {
  return (await db.prepare('SELECT COUNT(*) AS n FROM notificaciones WHERE user_id = ? AND leida = 0').get(userId)).n;
}

async function marcarLeida(userId, id) {
  return (await db.prepare('UPDATE notificaciones SET leida = 1 WHERE id = ? AND user_id = ?').run(id, userId)).changes;
}

async function marcarTodasLeidas(userId) {
  return (await db.prepare('UPDATE notificaciones SET leida = 1 WHERE user_id = ?').run(userId)).changes;
}

module.exports = { crear, listar, contarNoLeidas, marcarLeida, marcarTodasLeidas };
