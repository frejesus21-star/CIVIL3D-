const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const { validarCedulaVE, validarTelefonoPM } = require('../utils/validators');

const BANCOS_VENEZUELA = [
  'Banco de Venezuela','Banco Mercantil','BBVA Provincial','Banesco','BNC',
  'Banco Exterior','Banco Bicentenario','BFC','Banco Activo','Bancamiga',
  'Banplus','Banco del Tesoro','Banco Nacional de Crédito','Sofitasa'
];

function listar(req, res) {
  const rows = db.prepare('SELECT * FROM destinatarios WHERE user_id=? ORDER BY favorito DESC, nombre ASC').all(req.userId);
  res.json(rows.map(r => ({ ...r, favorito: !!r.favorito })));
}

function crear(req, res) {
  const { nombre, tipo, banco, numero_cuenta, cedula, telefono } = req.body;
  if (!nombre || !tipo) return res.status(400).json({ error: 'Nombre y tipo son requeridos' });

  if (cedula && !validarCedulaVE(cedula)) {
    return res.status(400).json({ error: 'Cédula venezolana no válida. Formato: V12345678 o E12345678' });
  }

  if (tipo === 'banco') {
    if (!banco || !numero_cuenta || !cedula) {
      return res.status(400).json({ error: 'Para transferencia bancaria se requiere banco, número de cuenta y cédula' });
    }
    const cuentaLimpia = String(numero_cuenta).replace(/\s/g, '');
    if (!/^\d{20}$/.test(cuentaLimpia)) {
      return res.status(400).json({ error: 'El número de cuenta venezolano debe tener 20 dígitos' });
    }
  } else if (tipo === 'pago_movil') {
    if (!telefono || !cedula || !banco) {
      return res.status(400).json({ error: 'Para pago móvil se requiere teléfono, cédula y banco' });
    }
    if (!validarTelefonoPM(telefono)) {
      return res.status(400).json({ error: 'Teléfono de pago móvil no válido. Debe iniciar en 0412/0414/0416/0424/0426 y tener 11 dígitos' });
    }
  } else {
    return res.status(400).json({ error: 'Tipo debe ser "banco" o "pago_movil"' });
  }

  const id = uuidv4();
  db.prepare('INSERT INTO destinatarios (id,user_id,nombre,tipo,banco,numero_cuenta,cedula,telefono) VALUES (?,?,?,?,?,?,?,?)')
    .run(id, req.userId, nombre, tipo, banco || null, numero_cuenta || null, cedula || null, telefono || null);
  const row = db.prepare('SELECT * FROM destinatarios WHERE id=?').get(id);
  res.status(201).json({ ...row, favorito: !!row.favorito });
}

function favorito(req, res) {
  const row = db.prepare('SELECT * FROM destinatarios WHERE id=? AND user_id=?').get(req.params.id, req.userId);
  if (!row) return res.status(404).json({ error: 'Destinatario no encontrado' });
  const nuevo = row.favorito ? 0 : 1;
  db.prepare('UPDATE destinatarios SET favorito=? WHERE id=?').run(nuevo, row.id);
  res.json({ ...row, favorito: !!nuevo });
}

function eliminar(req, res) {
  const result = db.prepare('DELETE FROM destinatarios WHERE id=? AND user_id=?').run(req.params.id, req.userId);
  if (!result.changes) return res.status(404).json({ error: 'Destinatario no encontrado' });
  res.json({ ok: true });
}

module.exports = { listar, crear, favorito, eliminar, BANCOS_VENEZUELA };
