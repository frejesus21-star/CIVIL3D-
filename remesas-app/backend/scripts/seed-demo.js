#!/usr/bin/env node
/**
 * Crea el usuario demo (demo@demo.com / demo12345) con rol admin.
 * Uso: node scripts/seed-demo.js
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('../src/config/database');

async function main() {
  await db.init();

  const email = 'demo@demo.com';
  const existing = await db.prepare('SELECT id FROM users WHERE email=?').get(email);
  if (existing) {
    console.log('El usuario demo ya existe. Actualizando contraseña y rol admin...');
    const hash = bcrypt.hashSync('demo12345', 10);
    await db.prepare('UPDATE users SET password_hash=?, is_admin=1, email_verificado=1 WHERE email=?').run(hash, email);
    console.log('✓ Actualizado.');
    return;
  }

  const id = uuidv4();
  const hash = bcrypt.hashSync('demo12345', 10);
  const rut = '12345678-9';

  await db.prepare(`
    INSERT INTO users (id, nombre, email, rut, password_hash, is_admin, email_verificado, kyc_estado, kyc_nivel)
    VALUES (?, ?, ?, ?, ?, 1, 1, 'verificado', 2)
  `).run(id, 'Demo Admin', email, rut, hash);

  // Cuenta bancaria de origen
  await db.prepare(`
    INSERT INTO cuentas_origen (id, user_id, banco, tipo_cuenta, numero_cuenta, titular)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(uuidv4(), id, 'Banco de Chile', 'Cuenta Corriente', '00123456789', 'Demo Admin');

  // Destinatario venezolano
  const destId = uuidv4();
  await db.prepare(`
    INSERT INTO destinatarios (id, user_id, nombre, tipo, banco, numero_cuenta, cedula, favorito)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1)
  `).run(destId, id, 'Juan Pérez', 'banco', 'Banco de Venezuela', '01020304050607080910', 'V12345678', 1);

  console.log('✓ Usuario demo creado exitosamente.');
  console.log('  Email:      demo@demo.com');
  console.log('  Contraseña: demo12345');
  console.log('  Rol:        Admin');
}

main().catch(err => { console.error('Error:', err.message); process.exit(1); });
