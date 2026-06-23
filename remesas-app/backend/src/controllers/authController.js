const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');

function signToken(userId) {
  return jwt.sign({ sub: userId }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

async function register(req, res) {
  const { nombre, email, telefono, rut, password } = req.body;
  if (!nombre || !email || !rut || !password) {
    return res.status(400).json({ error: 'Nombre, email, RUT y contraseña son requeridos' });
  }

  const rutLimpio = rut.replace(/[^0-9Kk]/g, '').toUpperCase();
  const existing = db.prepare('SELECT id FROM users WHERE email = ? OR rut = ?').get(email, rutLimpio);
  if (existing) return res.status(409).json({ error: 'Email o RUT ya registrado' });

  const hash = await bcrypt.hash(password, 12);
  const id = uuidv4();
  db.prepare('INSERT INTO users (id,nombre,email,telefono,rut,password_hash) VALUES (?,?,?,?,?,?)')
    .run(id, nombre, email.toLowerCase(), telefono || null, rutLimpio, hash);

  res.status(201).json({ token: signToken(id), user: { id, nombre, email, rut: rutLimpio } });
}

async function login(req, res) {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email y contraseña requeridos' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
  if (!user) return res.status(401).json({ error: 'Credenciales incorrectas' });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Credenciales incorrectas' });

  res.json({ token: signToken(user.id), user: { id: user.id, nombre: user.nombre, email: user.email, rut: user.rut } });
}

function me(req, res) {
  const user = db.prepare('SELECT id,nombre,email,telefono,rut,created_at FROM users WHERE id=?').get(req.userId);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  res.json(user);
}

module.exports = { register, login, me };
