const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const { validarRut, limpiarRut, validarEmail } = require('../utils/validators');
const { getResumen } = require('../services/limitsService');
const notif = require('../services/notificationService');

function signToken(userId) {
  return jwt.sign({ sub: userId }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

function publicUser(u) {
  return {
    id: u.id, nombre: u.nombre, email: u.email, telefono: u.telefono, rut: u.rut,
    kyc_estado: u.kyc_estado, kyc_nivel: u.kyc_nivel,
    fecha_nacimiento: u.fecha_nacimiento, direccion: u.direccion, ciudad: u.ciudad,
    is_admin: u.is_admin === 1,
  };
}

async function register(req, res) {
  const { nombre, email, telefono, rut, password } = req.body;
  if (!nombre || !email || !rut || !password) {
    return res.status(400).json({ error: 'Nombre, email, RUT y contraseña son requeridos' });
  }
  if (!validarEmail(email)) return res.status(400).json({ error: 'Email no válido' });
  if (!validarRut(rut)) return res.status(400).json({ error: 'RUT chileno no válido (revisa el dígito verificador)' });
  if (String(password).length < 8) return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });

  const rutLimpio = limpiarRut(rut);
  const existing = db.prepare('SELECT id FROM users WHERE email = ? OR rut = ?').get(email.toLowerCase(), rutLimpio);
  if (existing) return res.status(409).json({ error: 'Email o RUT ya registrado' });

  const hash = await bcrypt.hash(password, 12);
  const id = uuidv4();
  db.prepare('INSERT INTO users (id,nombre,email,telefono,rut,password_hash) VALUES (?,?,?,?,?,?)')
    .run(id, nombre, email.toLowerCase(), telefono || null, rutLimpio, hash);

  notif.crear(id, {
    tipo: 'bienvenida',
    titulo: '¡Bienvenido a RemesasVE! 🎉',
    mensaje: 'Tu cuenta está lista. Verifica tu identidad para aumentar tus límites de envío.',
  });

  const user = db.prepare('SELECT * FROM users WHERE id=?').get(id);
  res.status(201).json({ token: signToken(id), user: publicUser(user) });
}

async function login(req, res) {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email y contraseña requeridos' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
  if (!user) return res.status(401).json({ error: 'Credenciales incorrectas' });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Credenciales incorrectas' });

  res.json({ token: signToken(user.id), user: publicUser(user) });
}

function me(req, res) {
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.userId);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  res.json(publicUser(user));
}

function actualizarPerfil(req, res) {
  const { nombre, telefono, direccion, ciudad } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.userId);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

  db.prepare('UPDATE users SET nombre=?, telefono=?, direccion=?, ciudad=? WHERE id=?')
    .run(nombre || user.nombre, telefono ?? user.telefono, direccion ?? user.direccion, ciudad ?? user.ciudad, req.userId);

  res.json(publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(req.userId)));
}

async function cambiarPassword(req, res) {
  const { password_actual, password_nueva } = req.body;
  if (!password_actual || !password_nueva) return res.status(400).json({ error: 'Contraseña actual y nueva son requeridas' });
  if (String(password_nueva).length < 8) return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 8 caracteres' });

  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.userId);
  const valid = await bcrypt.compare(password_actual, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'La contraseña actual es incorrecta' });

  const hash = await bcrypt.hash(password_nueva, 12);
  db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hash, req.userId);
  res.json({ ok: true });
}

function stats(req, res) {
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.userId);
  const agg = db.prepare(`
    SELECT
      COUNT(*) AS total_transferencias,
      COALESCE(SUM(CASE WHEN estado='completada' THEN monto_clp ELSE 0 END),0) AS total_enviado_clp,
      COALESCE(SUM(CASE WHEN estado='completada' THEN monto_ves ELSE 0 END),0) AS total_enviado_ves,
      COUNT(CASE WHEN estado='completada' THEN 1 END) AS completadas,
      COUNT(CASE WHEN estado IN ('pendiente','procesando') THEN 1 END) AS en_proceso
    FROM transferencias WHERE user_id=?
  `).get(req.userId);

  res.json({ ...agg, limites: getResumen(user) });
}

module.exports = { register, login, me, actualizarPerfil, cambiarPassword, stats, publicUser };
