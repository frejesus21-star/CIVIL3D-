const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');

const BANCOS_VENEZUELA = [
  'Banco de Venezuela','Banco Mercantil','BBVA Provincial','Banesco','BNC',
  'Banco Exterior','Banco Bicentenario','BFC','Banco Activo','Bancamiga',
  'Banplus','Banco del Tesoro','Banco Nacional de Crédito','Sofitasa'
];

function listar(req, res) {
  const rows = db.prepare('SELECT * FROM destinatarios WHERE user_id=? ORDER BY nombre ASC').all(req.userId);
  res.json(rows);
}

function crear(req, res) {
  const { nombre, tipo, banco, numero_cuenta, cedula, telefono } = req.body;
  if (!nombre || !tipo) return res.status(400).json({ error: 'Nombre y tipo son requeridos' });

  if (tipo === 'banco') {
    if (!banco || !numero_cuenta || !cedula) {
      return res.status(400).json({ error: 'Para transferencia bancaria se requiere banco, número de cuenta y cédula' });
    }
  } else if (tipo === 'pago_movil') {
    if (!telefono || !cedula || !banco) {
      return res.status(400).json({ error: 'Para pago móvil se requiere teléfono, cédula y banco' });
    }
  } else {
    return res.status(400).json({ error: 'Tipo debe ser "banco" o "pago_movil"' });
  }

  const id = uuidv4();
  db.prepare('INSERT INTO destinatarios (id,user_id,nombre,tipo,banco,numero_cuenta,cedula,telefono) VALUES (?,?,?,?,?,?,?,?)')
    .run(id, req.userId, nombre, tipo, banco || null, numero_cuenta || null, cedula || null, telefono || null);
  res.status(201).json(db.prepare('SELECT * FROM destinatarios WHERE id=?').get(id));
}

function eliminar(req, res) {
  const result = db.prepare('DELETE FROM destinatarios WHERE id=? AND user_id=?').run(req.params.id, req.userId);
  if (!result.changes) return res.status(404).json({ error: 'Destinatario no encontrado' });
  res.json({ ok: true });
}

module.exports = { listar, crear, eliminar, BANCOS_VENEZUELA };
