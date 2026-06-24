const crypto = require('crypto');
const { randomUUID } = require('crypto');
const db = require('../config/database');

// Tokens de un solo uso con expiración, para verificación de email y
// recuperación de contraseña. Se guarda solo el hash; el token en claro
// viaja en el enlace del email y nunca se almacena.
function hash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Crea un token para un usuario. Invalida los anteriores del mismo tipo.
// ttlMin = minutos de validez. Devuelve el token en claro (para el enlace).
async function crear(userId, tipo, ttlMin) {
  await db.prepare('DELETE FROM tokens WHERE user_id=? AND tipo=?').run(userId, tipo);
  const token = crypto.randomBytes(32).toString('hex');
  const expira = new Date(Date.now() + ttlMin * 60000).toISOString();
  await db.prepare('INSERT INTO tokens (id, user_id, tipo, token_hash, expira) VALUES (?,?,?,?,?)')
    .run(randomUUID(), userId, tipo, hash(token), expira);
  return token;
}

// Verifica y CONSUME un token. Devuelve el user_id si es válido, o null.
async function consumir(tipo, token) {
  if (!token) return null;
  const row = await db.prepare('SELECT * FROM tokens WHERE tipo=? AND token_hash=? AND usado=0').get(tipo, hash(token));
  if (!row) return null;
  if (new Date(row.expira).getTime() < Date.now()) {
    await db.prepare('DELETE FROM tokens WHERE id=?').run(row.id);
    return null;
  }
  await db.prepare('UPDATE tokens SET usado=1 WHERE id=?').run(row.id);
  return row.user_id;
}

module.exports = { crear, consumir };
