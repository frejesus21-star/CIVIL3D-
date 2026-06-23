const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const { getRates, calcularTransferencia } = require('../services/exchangeService');

function genReferencia() {
  return 'REM' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase();
}

async function cotizar(req, res) {
  const { monto_clp } = req.query;
  if (!monto_clp || isNaN(monto_clp) || Number(monto_clp) < 1000) {
    return res.status(400).json({ error: 'Monto mínimo: $1.000 CLP' });
  }
  try {
    const rates = await getRates();
    const calculo = calcularTransferencia(Number(monto_clp), rates);
    res.json({ ...calculo, rates_actualizadas: !rates.cached, fuente: rates.fuente });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
}

async function crear(req, res) {
  const { cuenta_origen_id, destinatario_id, monto_clp } = req.body;
  if (!cuenta_origen_id || !destinatario_id || !monto_clp) {
    return res.status(400).json({ error: 'cuenta_origen_id, destinatario_id y monto_clp son requeridos' });
  }
  if (Number(monto_clp) < 1000) return res.status(400).json({ error: 'Monto mínimo: $1.000 CLP' });
  if (Number(monto_clp) > 5000000) return res.status(400).json({ error: 'Monto máximo: $5.000.000 CLP por transacción' });

  const cuenta = db.prepare('SELECT * FROM cuentas_origen WHERE id=? AND user_id=?').get(cuenta_origen_id, req.userId);
  if (!cuenta) return res.status(404).json({ error: 'Cuenta de origen no encontrada' });

  const destinatario = db.prepare('SELECT * FROM destinatarios WHERE id=? AND user_id=?').get(destinatario_id, req.userId);
  if (!destinatario) return res.status(404).json({ error: 'Destinatario no encontrado' });

  try {
    const rates = await getRates();
    const calc = calcularTransferencia(Number(monto_clp), rates);
    const id = uuidv4();
    const referencia = genReferencia();

    db.prepare(`
      INSERT INTO transferencias (id,user_id,cuenta_origen_id,destinatario_id,monto_clp,tasa_usd_clp,tasa_usd_ves,monto_usd,monto_ves,comision_clp,referencia)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
    `).run(id, req.userId, cuenta_origen_id, destinatario_id,
      calc.monto_clp, calc.tasa_usd_clp, calc.tasa_usd_ves,
      calc.monto_usd, calc.monto_ves, calc.comision_clp, referencia);

    // En producción real aquí iría la integración con el procesador de pagos
    // Por ahora simulamos aprobación después de 2s
    setTimeout(() => {
      db.prepare("UPDATE transferencias SET estado='completada', updated_at=CURRENT_TIMESTAMP WHERE id=?").run(id);
    }, 2000);

    const transferencia = db.prepare('SELECT * FROM transferencias WHERE id=?').get(id);
    res.status(201).json({ ...transferencia, cuenta, destinatario, calculo: calc });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
}

function listar(req, res) {
  const { page = 1, limit = 10 } = req.query;
  const offset = (Number(page) - 1) * Number(limit);
  const rows = db.prepare(`
    SELECT t.*,
      co.banco as origen_banco, co.tipo_cuenta as origen_tipo, co.numero_cuenta as origen_numero,
      d.nombre as dest_nombre, d.tipo as dest_tipo, d.banco as dest_banco, d.telefono as dest_telefono
    FROM transferencias t
    JOIN cuentas_origen co ON t.cuenta_origen_id = co.id
    JOIN destinatarios d ON t.destinatario_id = d.id
    WHERE t.user_id=?
    ORDER BY t.created_at DESC
    LIMIT ? OFFSET ?
  `).all(req.userId, Number(limit), offset);
  const total = db.prepare('SELECT COUNT(*) as n FROM transferencias WHERE user_id=?').get(req.userId).n;
  res.json({ rows, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
}

function obtener(req, res) {
  const row = db.prepare(`
    SELECT t.*,
      co.banco as origen_banco, co.tipo_cuenta as origen_tipo, co.numero_cuenta as origen_numero, co.titular as origen_titular,
      d.nombre as dest_nombre, d.tipo as dest_tipo, d.banco as dest_banco, d.numero_cuenta as dest_numero, d.cedula as dest_cedula, d.telefono as dest_telefono
    FROM transferencias t
    JOIN cuentas_origen co ON t.cuenta_origen_id = co.id
    JOIN destinatarios d ON t.destinatario_id = d.id
    WHERE t.id=? AND t.user_id=?
  `).get(req.params.id, req.userId);
  if (!row) return res.status(404).json({ error: 'Transferencia no encontrada' });
  res.json(row);
}

module.exports = { cotizar, crear, listar, obtener };
