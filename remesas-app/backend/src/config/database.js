const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '../../data/remesas.db');
const fs = require('fs');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    nombre TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    telefono TEXT,
    rut TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS cuentas_origen (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    banco TEXT NOT NULL,
    tipo_cuenta TEXT NOT NULL,
    numero_cuenta TEXT NOT NULL,
    titular TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS destinatarios (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    nombre TEXT NOT NULL,
    tipo TEXT NOT NULL CHECK(tipo IN ('banco', 'pago_movil')),
    banco TEXT,
    numero_cuenta TEXT,
    cedula TEXT,
    telefono TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS transferencias (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    cuenta_origen_id TEXT NOT NULL REFERENCES cuentas_origen(id),
    destinatario_id TEXT NOT NULL REFERENCES destinatarios(id),
    monto_clp REAL NOT NULL,
    tasa_usd_clp REAL NOT NULL,
    tasa_usd_ves REAL NOT NULL,
    monto_usd REAL NOT NULL,
    monto_ves REAL NOT NULL,
    comision_clp REAL NOT NULL,
    estado TEXT NOT NULL DEFAULT 'pendiente' CHECK(estado IN ('pendiente','procesando','completada','fallida')),
    referencia TEXT UNIQUE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS tasas_cache (
    id INTEGER PRIMARY KEY,
    usd_clp REAL NOT NULL,
    usd_ves REAL NOT NULL,
    fuente TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

module.exports = db;
