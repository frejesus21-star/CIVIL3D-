const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');

const BANCOS_CHILE = [
  'Banco de Chile','BancoEstado','Santander','BCI','Scotiabank',
  'Itaú','BICE','Banco Security','Falabella','Ripley','Consorcio','HSBC','Coopeuch'
];

async function listar(req, res) {
  const rows = await db.prepare('SELECT * FROM cuentas_origen WHERE user_id=? ORDER BY created_at DESC').all(req.userId);
  res.json(rows);
}

async function crear(req, res) {
  const { banco, tipo_cuenta, numero_cuenta, titular } = req.body;
  if (!banco || !tipo_cuenta || !numero_cuenta || !titular) {
    return res.status(400).json({ error: 'Todos los campos son requeridos' });
  }
  if (!BANCOS_CHILE.includes(banco)) {
    return res.status(400).json({ error: 'Banco no válido' });
  }
  const id = uuidv4();
  await db.prepare('INSERT INTO cuentas_origen (id,user_id,banco,tipo_cuenta,numero_cuenta,titular) VALUES (?,?,?,?,?,?)')
    .run(id, req.userId, banco, tipo_cuenta, numero_cuenta, titular);
  const row = await db.prepare('SELECT * FROM cuentas_origen WHERE id=?').get(id);
  res.status(201).json(row);
}

async function eliminar(req, res) {
  const result = await db.prepare('DELETE FROM cuentas_origen WHERE id=? AND user_id=?').run(req.params.id, req.userId);
  if (!result.changes) return res.status(404).json({ error: 'Cuenta no encontrada' });
  res.json({ ok: true });
}

module.exports = { listar, crear, eliminar, BANCOS_CHILE };
