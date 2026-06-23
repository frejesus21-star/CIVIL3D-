const db = require('../config/database');
const { getConfig, setConfig } = require('../config/database');
const { getRates, clearCache } = require('../services/exchangeService');
const audit = require('../services/auditService');

// ── Dashboard de estadísticas ──────────────────────────────────────────────
function stats(req, res) {
  const totalUsuarios = db.prepare('SELECT COUNT(*) as n FROM users WHERE is_admin = 0').get().n;
  const kycPendientes = db.prepare("SELECT COUNT(*) as n FROM users WHERE kyc_estado = 'en_revision'").get().n;
  const hoy = new Date().toISOString().slice(0, 10);
  const transHoy = db.prepare("SELECT COUNT(*) as n, COALESCE(SUM(monto_clp),0) as vol FROM transferencias WHERE DATE(created_at)=?").get(hoy);
  const transMes = db.prepare("SELECT COUNT(*) as n, COALESCE(SUM(monto_clp),0) as vol FROM transferencias WHERE strftime('%Y-%m',created_at)=strftime('%Y-%m','now')").get();
  const porEstado = db.prepare("SELECT estado, COUNT(*) as n FROM transferencias GROUP BY estado").all();
  res.json({ totalUsuarios, kycPendientes, transHoy, transMes, porEstado });
}

// ── Usuarios ───────────────────────────────────────────────────────────────
function listarUsuarios(req, res) {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = 20;
  const offset = (page - 1) * limit;
  const buscar = req.query.buscar ? `%${req.query.buscar}%` : '%';

  const total = db.prepare(
    "SELECT COUNT(*) as n FROM users WHERE is_admin=0 AND (nombre LIKE ? OR email LIKE ? OR rut LIKE ?)"
  ).get(buscar, buscar, buscar).n;

  const rows = db.prepare(`
    SELECT id, nombre, email, rut, telefono, kyc_estado, kyc_nivel,
           ciudad, created_at,
           (SELECT COUNT(*) FROM transferencias WHERE user_id=users.id) as num_trans,
           (SELECT COALESCE(SUM(monto_clp),0) FROM transferencias WHERE user_id=users.id AND estado='completada') as vol_total
    FROM users WHERE is_admin=0 AND (nombre LIKE ? OR email LIKE ? OR rut LIKE ?)
    ORDER BY created_at DESC LIMIT ? OFFSET ?
  `).all(buscar, buscar, buscar, limit, offset);

  res.json({ rows, total, pages: Math.ceil(total / limit), page });
}

function getUsuario(req, res) {
  const user = db.prepare(`
    SELECT id, nombre, email, rut, telefono, kyc_estado, kyc_nivel,
           fecha_nacimiento, direccion, ciudad, tipo_documento, numero_documento, created_at
    FROM users WHERE id = ? AND is_admin = 0
  `).get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

  const transferencias = db.prepare(
    'SELECT id, referencia, monto_clp, monto_ves, estado, created_at FROM transferencias WHERE user_id=? ORDER BY created_at DESC LIMIT 10'
  ).all(req.params.id);

  res.json({ ...user, transferencias });
}

// ── KYC: aprobar / rechazar ────────────────────────────────────────────────
function aprobarKYC(req, res) {
  const user = db.prepare("SELECT id, kyc_estado FROM users WHERE id=? AND is_admin=0").get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  if (user.kyc_estado !== 'en_revision') return res.status(400).json({ error: 'El usuario no está en revisión' });

  db.prepare("UPDATE users SET kyc_estado='verificado', kyc_nivel=2 WHERE id=?").run(req.params.id);

  // Notificar al usuario
  const { randomUUID } = require('crypto');
  db.prepare(`INSERT INTO notificaciones (id,user_id,tipo,titulo,mensaje) VALUES (?,?,'exito','KYC aprobado','Tu identidad ha sido verificada. Ahora tienes límites ampliados.')`).run(randomUUID(), req.params.id);

  audit.registrar(req, { accion: 'aprobar_kyc', entidad: 'usuario', entidad_id: req.params.id });
  res.json({ ok: true });
}

function rechazarKYC(req, res) {
  const user = db.prepare("SELECT id, kyc_estado FROM users WHERE id=? AND is_admin=0").get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

  const motivo = req.body.motivo || 'No se pudo verificar la información proporcionada.';
  db.prepare("UPDATE users SET kyc_estado='rechazado' WHERE id=?").run(req.params.id);

  const { randomUUID } = require('crypto');
  db.prepare(`INSERT INTO notificaciones (id,user_id,tipo,titulo,mensaje) VALUES (?,?,'error','KYC rechazado',?)`).run(randomUUID(), req.params.id, `Tu verificación fue rechazada: ${motivo}`);

  audit.registrar(req, { accion: 'rechazar_kyc', entidad: 'usuario', entidad_id: req.params.id, detalle: { motivo } });
  res.json({ ok: true });
}

// Construye condiciones de filtro (estado + rango de fechas) de forma segura.
// `desde`/`hasta` se esperan como YYYY-MM-DD; `hasta` es inclusivo.
function filtrosTransferencias(q) {
  const cond = [];
  const params = [];
  if (q.estado) { cond.push('t.estado = ?'); params.push(q.estado); }
  if (q.desde) { cond.push('DATE(t.created_at) >= DATE(?)'); params.push(q.desde); }
  if (q.hasta) { cond.push('DATE(t.created_at) <= DATE(?)'); params.push(q.hasta); }
  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
  return { where, params };
}

// ── Transferencias (vista admin) ───────────────────────────────────────────
function listarTransferencias(req, res) {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = 25;
  const offset = (page - 1) * limit;

  const { where, params } = filtrosTransferencias(req.query);
  const total = db.prepare(`SELECT COUNT(*) as n FROM transferencias t ${where}`).get(...params).n;
  const rows = db.prepare(`
    SELECT t.id, t.referencia, t.monto_clp, t.monto_ves, t.monto_usd,
           t.comision_clp, t.tasa_usd_clp, t.tasa_usd_ves,
           t.estado, t.notas_admin, t.created_at, t.updated_at,
           u.nombre as usuario_nombre, u.email as usuario_email, u.rut as usuario_rut,
           d.nombre as dest_nombre, d.tipo as dest_tipo, d.banco as dest_banco,
           d.numero_cuenta as dest_cuenta, d.telefono as dest_telefono,
           c.banco as origen_banco, c.numero_cuenta as origen_cuenta, c.tipo_cuenta as origen_tipo
    FROM transferencias t
    JOIN users u ON u.id = t.user_id
    JOIN destinatarios d ON d.id = t.destinatario_id
    JOIN cuentas_origen c ON c.id = t.cuenta_origen_id
    ${where}
    ORDER BY t.created_at DESC LIMIT ? OFFSET ?
  `).all(...params, limit, offset);

  res.json({ rows, total, pages: Math.ceil(total / limit), page });
}

function actualizarTransferencia(req, res) {
  const { estado, notas_admin } = req.body;
  const estados = ['pendiente', 'procesando', 'completada', 'fallida', 'cancelada'];
  if (estado && !estados.includes(estado)) return res.status(400).json({ error: 'Estado inválido' });

  const t = db.prepare('SELECT id, user_id, estado FROM transferencias WHERE id=?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Transferencia no encontrada' });

  const updates = [];
  const vals = [];
  if (estado) { updates.push('estado=?'); vals.push(estado); }
  if (notas_admin !== undefined) { updates.push('notas_admin=?'); vals.push(notas_admin); }
  updates.push("updated_at=CURRENT_TIMESTAMP");
  vals.push(req.params.id);

  db.prepare(`UPDATE transferencias SET ${updates.join(',')} WHERE id=?`).run(...vals);

  if (estado && estado !== t.estado) {
    const { randomUUID } = require('crypto');
    db.prepare('INSERT INTO transferencia_eventos (id,transferencia_id,estado,descripcion) VALUES (?,?,?,?)').run(
      randomUUID(), t.id, estado, `Estado actualizado por administrador`
    );

    const mensajes = {
      completada: `Tu transferencia ha sido completada exitosamente.`,
      fallida: `Tu transferencia ha fallado. Por favor contáctanos para asistencia.`,
    };
    if (mensajes[estado]) {
      db.prepare(`INSERT INTO notificaciones (id,user_id,tipo,titulo,mensaje,meta) VALUES (?,?,?,?,?,?)`).run(
        randomUUID(), t.user_id,
        estado === 'completada' ? 'exito' : 'error',
        `Transferencia ${estado}`,
        mensajes[estado],
        JSON.stringify({ transferencia_id: t.id })
      );
    }
  }

  if (estado && estado !== t.estado) {
    audit.registrar(req, { accion: 'cambiar_estado_transferencia', entidad: 'transferencia', entidad_id: t.id, detalle: { de: t.estado, a: estado } });
  }

  res.json({ ok: true });
}

// ── Tasas de cambio ────────────────────────────────────────────────────────
async function getTasas(req, res) {
  try {
    const rates = await getRates();
    const cache = db.prepare('SELECT * FROM tasas_cache ORDER BY id DESC LIMIT 1').get();
    res.json({ rates, cache });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
}

function setTasas(req, res) {
  const { usd_clp, usd_ves } = req.body;
  if (!usd_clp || !usd_ves || isNaN(usd_clp) || isNaN(usd_ves)) {
    return res.status(400).json({ error: 'Se requieren usd_clp y usd_ves numéricos' });
  }
  if (usd_clp < 100 || usd_clp > 5000) return res.status(400).json({ error: 'usd_clp fuera de rango razonable (100-5000)' });
  if (usd_ves < 1 || usd_ves > 500000) return res.status(400).json({ error: 'usd_ves fuera de rango razonable' });

  // Borra cache anterior y guarda manual
  db.prepare('DELETE FROM tasas_cache').run();
  db.prepare('INSERT INTO tasas_cache (usd_clp, usd_ves, fuente, manual) VALUES (?,?,?,1)')
    .run(parseFloat(usd_clp), parseFloat(usd_ves), 'manual_admin');

  clearCache();
  audit.registrar(req, { accion: 'ajustar_tasas', entidad: 'tasas', detalle: { usd_clp: parseFloat(usd_clp), usd_ves: parseFloat(usd_ves) } });
  res.json({ ok: true, usd_clp: parseFloat(usd_clp), usd_ves: parseFloat(usd_ves) });
}

function resetTasas(req, res) {
  db.prepare('DELETE FROM tasas_cache').run();
  clearCache();
  res.json({ ok: true, mensaje: 'Cache borrada. Próxima consulta obtendrá tasas de la API.' });
}

// ── Configuración general ──────────────────────────────────────────────────
function getConfigAdmin(req, res) {
  const claves = ['comision_pct', 'comision_minima_clp', 'mensaje_mantenimiento'];
  const config = {};
  for (const c of claves) config[c] = getConfig(c);
  res.json(config);
}

function setConfigAdmin(req, res) {
  const { comision_pct, comision_minima_clp, mensaje_mantenimiento } = req.body;

  if (comision_pct !== undefined) {
    const v = parseFloat(comision_pct);
    if (isNaN(v) || v < 0 || v > 20) return res.status(400).json({ error: 'La comisión debe estar entre 0% y 20%' });
    setConfig('comision_pct', v);
  }

  if (comision_minima_clp !== undefined) {
    const v = parseFloat(comision_minima_clp);
    if (isNaN(v) || v < 0) return res.status(400).json({ error: 'La comisión mínima no puede ser negativa' });
    setConfig('comision_minima_clp', v);
  }

  if (mensaje_mantenimiento !== undefined) {
    setConfig('mensaje_mantenimiento', String(mensaje_mantenimiento).slice(0, 300));
  }

  audit.registrar(req, { accion: 'actualizar_configuracion', entidad: 'configuracion', detalle: req.body });
  res.json({ ok: true });
}

// ── Registro de auditoría ──────────────────────────────────────────────────
function listarLog(req, res) {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  res.json(audit.listar({
    page,
    accion: req.query.accion || null,
    desde: req.query.desde || null,
    hasta: req.query.hasta || null,
  }));
}

// ── Exportación a CSV ──────────────────────────────────────────────────────
function csvEscape(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCSV(headers, rows) {
  const lines = [headers.join(',')];
  for (const r of rows) lines.push(r.map(csvEscape).join(','));
  return '﻿' + lines.join('\r\n'); // BOM para Excel
}

function exportarUsuarios(req, res) {
  const rows = db.prepare(`
    SELECT nombre, email, rut, telefono, kyc_estado, kyc_nivel, ciudad, created_at,
           (SELECT COUNT(*) FROM transferencias WHERE user_id=users.id) as num_trans,
           (SELECT COALESCE(SUM(monto_clp),0) FROM transferencias WHERE user_id=users.id AND estado='completada') as vol_total
    FROM users WHERE is_admin=0 ORDER BY created_at DESC
  `).all();

  const headers = ['Nombre', 'Email', 'RUT', 'Teléfono', 'Estado KYC', 'Nivel KYC', 'Ciudad', 'Registro', 'N° transferencias', 'Volumen completado CLP'];
  const data = rows.map(u => [u.nombre, u.email, u.rut, u.telefono, u.kyc_estado, u.kyc_nivel, u.ciudad, u.created_at, u.num_trans, u.vol_total]);

  audit.registrar(req, { accion: 'exportar_csv', entidad: 'usuarios', detalle: { total: rows.length } });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="usuarios_${new Date().toISOString().slice(0,10)}.csv"`);
  res.send(toCSV(headers, data));
}

function exportarTransferencias(req, res) {
  const { where, params } = filtrosTransferencias(req.query);
  const rows = db.prepare(`
    SELECT t.referencia, u.nombre as usuario, u.rut, t.monto_clp, t.comision_clp, t.monto_usd, t.monto_ves,
           t.tasa_usd_clp, t.tasa_usd_ves, t.estado, d.nombre as destinatario, d.tipo as tipo_destino, t.created_at
    FROM transferencias t
    JOIN users u ON u.id = t.user_id
    JOIN destinatarios d ON d.id = t.destinatario_id
    ${where}
    ORDER BY t.created_at DESC
  `).all(...params);

  const headers = ['Referencia', 'Usuario', 'RUT', 'Monto CLP', 'Comisión CLP', 'Monto USD', 'Monto VES', 'Tasa USD/CLP', 'Tasa USD/VES', 'Estado', 'Destinatario', 'Tipo destino', 'Fecha'];
  const data = rows.map(t => [t.referencia, t.usuario, t.rut, t.monto_clp, t.comision_clp, t.monto_usd, t.monto_ves, t.tasa_usd_clp, t.tasa_usd_ves, t.estado, t.destinatario, t.tipo_destino, t.created_at]);

  audit.registrar(req, { accion: 'exportar_csv', entidad: 'transferencias', detalle: { total: rows.length, estado: req.query.estado || null, desde: req.query.desde || null, hasta: req.query.hasta || null } });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="transferencias_${new Date().toISOString().slice(0,10)}.csv"`);
  res.send(toCSV(headers, data));
}

module.exports = { stats, listarUsuarios, getUsuario, aprobarKYC, rechazarKYC, listarTransferencias, actualizarTransferencia, getTasas, setTasas, resetTasas, getConfigAdmin, setConfigAdmin, listarLog, exportarUsuarios, exportarTransferencias };
