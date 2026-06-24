#!/usr/bin/env node
/**
 * Crea el usuario demo (demo@demo.com / demo12345) con rol admin.
 * Uso: node scripts/seed-demo.js
 */
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const USE_PG = !!process.env.DATABASE_URL;

async function main() {
  if (USE_PG) {
    await seedPostgres();
  } else {
    seedSqlite();
  }
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, nombre TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
    telefono TEXT, rut TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
    kyc_estado TEXT NOT NULL DEFAULT 'no_iniciado', kyc_nivel INTEGER NOT NULL DEFAULT 1,
    fecha_nacimiento TEXT, direccion TEXT, ciudad TEXT, tipo_documento TEXT, numero_documento TEXT,
    is_admin INTEGER NOT NULL DEFAULT 0, totp_secret TEXT, totp_enabled INTEGER NOT NULL DEFAULT 0,
    email_verificado INTEGER NOT NULL DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS cuentas_origen (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, banco TEXT NOT NULL,
    tipo_cuenta TEXT NOT NULL, numero_cuenta TEXT NOT NULL, titular TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS destinatarios (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, nombre TEXT NOT NULL,
    tipo TEXT NOT NULL, banco TEXT, numero_cuenta TEXT, cedula TEXT, telefono TEXT,
    favorito INTEGER NOT NULL DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS configuracion (
    clave TEXT PRIMARY KEY, valor TEXT NOT NULL, descripcion TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`;

const SEED_CONFIG = `
  INSERT INTO configuracion (clave, valor) VALUES
    ('comision_pct','2.5'),('comision_minima_clp','0'),('mensaje_mantenimiento','')
  ON CONFLICT(clave) DO NOTHING;
`;

function seedSqlite() {
  const { DatabaseSync } = require('node:sqlite');
  const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/remesas.db');
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = OFF');
  db.exec(SCHEMA);
  db.exec(SEED_CONFIG);

  const hash = bcrypt.hashSync('demo12345', 10);
  const email = 'demo@demo.com';

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);

  if (existing) {
    db.prepare('UPDATE users SET password_hash = ?, is_admin = 1, email_verificado = 1 WHERE email = ?')
      .run(hash, email);
    console.log('✓ Usuario demo actualizado.');
  } else {
    const id = uuidv4();
    db.prepare(
      'INSERT INTO users (id,nombre,email,rut,password_hash,is_admin,email_verificado,kyc_estado,kyc_nivel) VALUES (?,?,?,?,?,1,1,\'verificado\',2)'
    ).run(id, 'Demo Admin', email, '12345678-9', hash);

    db.prepare(
      'INSERT INTO cuentas_origen (id,user_id,banco,tipo_cuenta,numero_cuenta,titular) VALUES (?,?,?,?,?,?)'
    ).run(uuidv4(), id, 'Banco de Chile', 'Cuenta Corriente', '00123456789', 'Demo Admin');

    db.prepare(
      'INSERT INTO destinatarios (id,user_id,nombre,tipo,banco,numero_cuenta,cedula,favorito) VALUES (?,?,?,?,?,?,?,1)'
    ).run(uuidv4(), id, 'Juan Pérez', 'banco', 'Banco de Venezuela', '01020304050607080910', 'V12345678');

    console.log('✓ Usuario demo creado.');
  }

  console.log('  Email:      demo@demo.com');
  console.log('  Contraseña: demo12345');
  console.log('  Rol:        Admin');
  db.close();
}

async function seedPostgres() {
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const hash = bcrypt.hashSync('demo12345', 10);
  const email = 'demo@demo.com';
  const { rows } = await pool.query('SELECT id FROM users WHERE email=$1', [email]);
  if (rows.length) {
    await pool.query('UPDATE users SET password_hash=$1,is_admin=1,email_verificado=1 WHERE email=$2', [hash, email]);
    console.log('✓ Usuario demo actualizado.');
  } else {
    const id = uuidv4();
    await pool.query(`INSERT INTO users (id,nombre,email,rut,password_hash,is_admin,email_verificado,kyc_estado,kyc_nivel) VALUES ($1,$2,$3,$4,$5,1,1,'verificado',2)`, [id,'Demo Admin',email,'12345678-9',hash]);
    await pool.query('INSERT INTO cuentas_origen (id,user_id,banco,tipo_cuenta,numero_cuenta,titular) VALUES ($1,$2,$3,$4,$5,$6)', [uuidv4(),id,'Banco de Chile','Cuenta Corriente','00123456789','Demo Admin']);
    await pool.query('INSERT INTO destinatarios (id,user_id,nombre,tipo,banco,numero_cuenta,cedula,favorito) VALUES ($1,$2,$3,$4,$5,$6,$7,1)', [uuidv4(),id,'Juan Pérez','banco','Banco de Venezuela','01020304050607080910','V12345678']);
    console.log('✓ Usuario demo creado.');
  }
  console.log('  Email:      demo@demo.com');
  console.log('  Contraseña: demo12345');
  await pool.end();
}

main().catch(err => { console.error('Error:', err.message); process.exit(1); });
