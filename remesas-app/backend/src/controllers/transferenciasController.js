const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const { getRates, calcularTransferencia, calcularInverso, getComisionPct } = require('../services/exchangeService');
const { validarEnvio } = require('../services/limitsService');
const notif = require('../services/notificationService');
const comprobante = require('../services/comprobanteService');
const email = require('../services/emailService');

function genReferencia() {
  return 'REM' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase();
}

async function registrarEvento(transferenciaId, estado, descripcion) {
  await db.prepare('INSERT INTO transferencia_eventos (id,transferencia_id,estado,descripcion) VALUES (?,?,?,?)')
    .run(uuidv4(), transferenciaId, estado, descripcion);
}

async function cotizar(req, res) {
  const { monto_clp, monto_ves } = req.query;
  try {
    const rates = await getRates();
    const comision = await getComisionPct();
    let calculo;
    if (monto_ves && Number(monto_ves) > 0) {
      // Cotización inversa: el usuario indica cuánto quiere que llegue en Bs.
      calculo = calcularInverso(Number(monto_ves), rates, comision);
      if (calculo.monto_clp < 1000) return res.status(400).json({ error: 'El monto resultante es menor al mínimo de $1.000 CLP' });
    } else {
      if (!monto_clp || isNaN(monto_clp) || Number(monto_clp) < 1000) {
        return res.status(400).json({ error: 'Monto mínimo: $1.000 CLP' });
      }
      calculo = calcularTransferencia(Number(monto_clp), rates, comision);
    }
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

  const user = await db.prepare('SELECT * FROM users WHERE id=?').get(req.userId);

  // Seguridad: el usuario debe tener 2FA activo para poder enviar dinero
  if (!user.totp_enabled) {
    return res.status(403).json({
      error: 'Debes activar la verificación en dos pasos (2FA) antes de realizar transferencias. Actívala en Mi Perfil → Seguridad.',
      codigo: 'REQUIERE_2FA',
    });
  }

  // Validación de límites por nivel KYC (cumplimiento / anti-lavado)
  const limite = await validarEnvio(user, Number(monto_clp));
  if (!limite.ok) return res.status(403).json({ error: limite.error, codigo: 'LIMITE_EXCEDIDO' });

  const cuenta = await db.prepare('SELECT * FROM cuentas_origen WHERE id=? AND user_id=?').get(cuenta_origen_id, req.userId);
  if (!cuenta) return res.status(404).json({ error: 'Cuenta de origen no encontrada' });

  const destinatario = await db.prepare('SELECT * FROM destinatarios WHERE id=? AND user_id=?').get(destinatario_id, req.userId);
  if (!destinatario) return res.status(404).json({ error: 'Destinatario no encontrado' });

  try {
    const rates = await getRates();
    const comision = await getComisionPct();
    const calc = calcularTransferencia(Number(monto_clp), rates, comision);
    const id = uuidv4();
    const referencia = genReferencia();

    await db.prepare(`
      INSERT INTO transferencias (id,user_id,cuenta_origen_id,destinatario_id,monto_clp,tasa_usd_clp,tasa_usd_ves,monto_usd,monto_ves,comision_clp,referencia)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
    `).run(id, req.userId, cuenta_origen_id, destinatario_id,
      calc.monto_clp, calc.tasa_usd_clp, calc.tasa_usd_ves,
      calc.monto_usd, calc.monto_ves, calc.comision_clp, referencia);

    await registrarEvento(id, 'pendiente', 'Transferencia creada — esperando confirmación de pago');
    notif.crear(req.userId, {
      tipo: 'transferencia',
      titulo: 'Transferencia recibida 📨',
      mensaje: `Tu envío de $${calc.monto_clp.toLocaleString('es-CL')} CLP a ${destinatario.nombre} fue registrado. Realiza la transferencia bancaria para completar el proceso. Ref: ${referencia}`,
      meta: { transferencia_id: id },
    });

    const transferencia = await db.prepare('SELECT * FROM transferencias WHERE id=?').get(id);
    res.status(201).json({ ...transferencia, cuenta, destinatario, calculo: calc });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
}


async function listar(req, res) {
  const { page = 1, limit = 10, estado } = req.query;
  const offset = (Number(page) - 1) * Number(limit);
  const filtroEstado = estado ? 'AND t.estado = ?' : '';
  const params = estado ? [req.userId, estado, Number(limit), offset] : [req.userId, Number(limit), offset];
  const rows = await db.prepare(`
    SELECT t.*,
      co.banco as origen_banco, co.tipo_cuenta as origen_tipo, co.numero_cuenta as origen_numero,
      d.nombre as dest_nombre, d.tipo as dest_tipo, d.banco as dest_banco, d.telefono as dest_telefono
    FROM transferencias t
    JOIN cuentas_origen co ON t.cuenta_origen_id = co.id
    JOIN destinatarios d ON t.destinatario_id = d.id
    WHERE t.user_id = ? ${filtroEstado}
    ORDER BY t.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params);

  const total = (await db.prepare(`SELECT COUNT(*) as n FROM transferencias WHERE user_id=? ${estado ? 'AND estado=?' : ''}`)
    .get(...(estado ? [req.userId, estado] : [req.userId]))).n;

  res.json({ rows, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
}

async function obtener(req, res) {
  const row = await db.prepare(`
    SELECT t.*,
      co.banco as origen_banco, co.tipo_cuenta as origen_tipo, co.numero_cuenta as origen_numero, co.titular as origen_titular,
      d.nombre as dest_nombre, d.tipo as dest_tipo, d.banco as dest_banco, d.numero_cuenta as dest_numero, d.cedula as dest_cedula, d.telefono as dest_telefono
    FROM transferencias t
    JOIN cuentas_origen co ON t.cuenta_origen_id = co.id
    JOIN destinatarios d ON t.destinatario_id = d.id
    WHERE t.id=? AND t.user_id=?
  `).get(req.params.id, req.userId);
  if (!row) return res.status(404).json({ error: 'Transferencia no encontrada' });

  const eventos = await db.prepare('SELECT estado, descripcion, created_at FROM transferencia_eventos WHERE transferencia_id=? ORDER BY created_at ASC').all(req.params.id);
  res.json({ ...row, eventos });
}

// Genera y descarga el comprobante de la transferencia en PDF
async function comprobantePDF(req, res) {
  const row = await db.prepare(`
    SELECT t.*,
      co.banco as origen_banco, co.tipo_cuenta as origen_tipo, co.numero_cuenta as origen_numero, co.titular as origen_titular,
      d.nombre as dest_nombre, d.tipo as dest_tipo, d.banco as dest_banco, d.numero_cuenta as dest_numero, d.cedula as dest_cedula, d.telefono as dest_telefono
    FROM transferencias t
    JOIN cuentas_origen co ON t.cuenta_origen_id = co.id
    JOIN destinatarios d ON t.destinatario_id = d.id
    WHERE t.id=? AND t.user_id=?
  `).get(req.params.id, req.userId);
  if (!row) return res.status(404).json({ error: 'Transferencia no encontrada' });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="comprobante_${row.referencia}.pdf"`);
  comprobante.generar(row, res);
}

// Cancelar una transferencia que aún está pendiente
async function cancelar(req, res) {
  const t = await db.prepare('SELECT * FROM transferencias WHERE id=? AND user_id=?').get(req.params.id, req.userId);
  if (!t) return res.status(404).json({ error: 'Transferencia no encontrada' });
  if (t.estado !== 'pendiente') {
    return res.status(409).json({ error: 'Solo se pueden cancelar transferencias en estado pendiente' });
  }
  await db.prepare("UPDATE transferencias SET estado='cancelada', updated_at=CURRENT_TIMESTAMP WHERE id=?").run(t.id);
  await registrarEvento(t.id, 'cancelada', 'Cancelada por el usuario');
  notif.crear(req.userId, {
    tipo: 'transferencia',
    titulo: 'Transferencia cancelada',
    mensaje: `Cancelaste el envío con referencia ${t.referencia}.`,
    meta: { transferencia_id: t.id },
  });
  res.json({ ok: true });
}

module.exports = { cotizar, crear, listar, obtener, cancelar, comprobantePDF };
