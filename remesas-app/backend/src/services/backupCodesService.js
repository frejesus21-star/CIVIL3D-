const crypto = require('crypto');
const { randomUUID } = require('crypto');
const db = require('../config/database');

const CANTIDAD = 10;

// Los códigos son de alta entropía, así que un hash SHA-256 es suficiente
// (no requieren el coste de bcrypt) y permite verificar rápido en el login.
function hash(codigo) {
  return crypto.createHash('sha256').update(codigo.toUpperCase().replace(/[\s-]/g, '')).digest('hex');
}

function generarCodigo() {
  // 8 caracteres hex en dos grupos: ABCD-1234
  const raw = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

// Regenera el set completo: borra los anteriores y crea CANTIDAD nuevos.
// Devuelve los códigos en texto plano (solo se muestran esta vez).
async function generar(userId) {
  const codigos = [];
  await db.tx(async (q) => {
    await q('DELETE FROM backup_codes WHERE user_id=?').run(userId);
    for (let i = 0; i < CANTIDAD; i++) {
      const codigo = generarCodigo();
      codigos.push(codigo);
      await q('INSERT INTO backup_codes (id, user_id, code_hash) VALUES (?,?,?)').run(randomUUID(), userId, hash(codigo));
    }
  });
  return codigos;
}

// Verifica y CONSUME un código de respaldo. Devuelve true si era válido.
async function consumir(userId, codigo) {
  if (!codigo) return false;
  const h = hash(codigo);
  const row = await db.prepare('SELECT id FROM backup_codes WHERE user_id=? AND code_hash=? AND usado=0').get(userId, h);
  if (!row) return false;
  await db.prepare('UPDATE backup_codes SET usado=1 WHERE id=?').run(row.id);
  return true;
}

async function contarDisponibles(userId) {
  return (await db.prepare('SELECT COUNT(*) as n FROM backup_codes WHERE user_id=? AND usado=0').get(userId)).n;
}

async function eliminar(userId) {
  await db.prepare('DELETE FROM backup_codes WHERE user_id=?').run(userId);
}

module.exports = { generar, consumir, contarDisponibles, eliminar };
