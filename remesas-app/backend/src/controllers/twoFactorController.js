const bcrypt = require('bcryptjs');
const QRCode = require('qrcode');
const db = require('../config/database');
const totp = require('../utils/totp');
const backupCodes = require('../services/backupCodesService');

// Genera un QR (SVG en data URI) a partir del URI otpauth. Si falla,
// devuelve null para que el frontend caiga al ingreso manual de la clave.
async function generarQR(otpauth) {
  try {
    const svg = await QRCode.toString(otpauth, { type: 'svg', margin: 1, width: 200 });
    return 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
  } catch {
    return null;
  }
}

// Inicia la configuración de 2FA: genera (o reusa) un secreto pendiente
// y devuelve el URI otpauth y el secreto para escanear/ingresar manualmente.
// No activa el 2FA todavía: requiere confirmar un código válido.
async function setup(req, res) {
  const user = await db.prepare('SELECT * FROM users WHERE id=?').get(req.userId);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  if (user.totp_enabled) return res.status(400).json({ error: 'El 2FA ya está activado' });

  const secreto = totp.generarSecreto();
  await db.prepare('UPDATE users SET totp_secret=? WHERE id=?').run(secreto, req.userId);

  const otpauth = totp.otpauthURI(secreto, user.email);
  res.json({
    secreto,
    otpauth,
    qr: await generarQR(otpauth),
  });
}

// Confirma el código del autenticador y activa el 2FA
async function activar(req, res) {
  const { codigo } = req.body;
  const user = await db.prepare('SELECT * FROM users WHERE id=?').get(req.userId);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  if (user.totp_enabled) return res.status(400).json({ error: 'El 2FA ya está activado' });
  if (!user.totp_secret) return res.status(400).json({ error: 'Primero inicia la configuración del 2FA' });

  if (!totp.verificar(user.totp_secret, codigo)) {
    return res.status(400).json({ error: 'Código incorrecto. Verifica la hora de tu dispositivo e inténtalo de nuevo.' });
  }

  await db.prepare('UPDATE users SET totp_enabled=1 WHERE id=?').run(req.userId);

  // Genera los códigos de respaldo de un solo uso (se muestran solo ahora)
  const codigos = await backupCodes.generar(req.userId);
  res.json({ ok: true, mensaje: 'Autenticación en dos pasos activada', codigos_respaldo: codigos });
}

// Desactiva el 2FA (requiere contraseña por seguridad)
async function desactivar(req, res) {
  const { password } = req.body;
  const user = await db.prepare('SELECT * FROM users WHERE id=?').get(req.userId);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  if (!user.totp_enabled) return res.status(400).json({ error: 'El 2FA no está activado' });

  const valid = await bcrypt.compare(password || '', user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Contraseña incorrecta' });

  await db.prepare('UPDATE users SET totp_enabled=0, totp_secret=NULL WHERE id=?').run(req.userId);
  await backupCodes.eliminar(req.userId);
  res.json({ ok: true, mensaje: 'Autenticación en dos pasos desactivada' });
}

async function estado(req, res) {
  const user = await db.prepare('SELECT totp_enabled FROM users WHERE id=?').get(req.userId);
  const activado = !!(user && user.totp_enabled);
  res.json({ activado, codigos_respaldo_disponibles: activado ? await backupCodes.contarDisponibles(req.userId) : 0 });
}

// Regenera los códigos de respaldo (requiere contraseña por seguridad)
async function regenerarCodigos(req, res) {
  const { password } = req.body;
  const user = await db.prepare('SELECT * FROM users WHERE id=?').get(req.userId);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  if (!user.totp_enabled) return res.status(400).json({ error: 'El 2FA no está activado' });

  const valid = await bcrypt.compare(password || '', user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Contraseña incorrecta' });

  const codigos = await backupCodes.generar(req.userId);
  res.json({ ok: true, codigos_respaldo: codigos });
}

module.exports = { setup, activar, desactivar, estado, regenerarCodigos };
