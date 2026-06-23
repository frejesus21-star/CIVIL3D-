const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '../../data/remesas.db');
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
    kyc_estado TEXT NOT NULL DEFAULT 'no_iniciado' CHECK(kyc_estado IN ('no_iniciado','en_revision','verificado','rechazado')),
    kyc_nivel INTEGER NOT NULL DEFAULT 1,
    fecha_nacimiento TEXT,
    direccion TEXT,
    ciudad TEXT,
    tipo_documento TEXT,
    numero_documento TEXT,
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
    favorito INTEGER NOT NULL DEFAULT 0,
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
    estado TEXT NOT NULL DEFAULT 'pendiente' CHECK(estado IN ('pendiente','procesando','completada','fallida','cancelada')),
    referencia TEXT UNIQUE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS transferencia_eventos (
    id TEXT PRIMARY KEY,
    transferencia_id TEXT NOT NULL REFERENCES transferencias(id) ON DELETE CASCADE,
    estado TEXT NOT NULL,
    descripcion TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS notificaciones (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL DEFAULT 'info',
    titulo TEXT NOT NULL,
    mensaje TEXT NOT NULL,
    meta TEXT,
    leida INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS tasas_cache (
    id INTEGER PRIMARY KEY,
    usd_clp REAL NOT NULL,
    usd_ves REAL NOT NULL,
    fuente TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_trans_user ON transferencias(user_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_notif_user ON notificaciones(user_id, leida);
  CREATE INDEX IF NOT EXISTS idx_eventos_trans ON transferencia_eventos(transferencia_id);
`);

// Migración idempotente: añade columnas nuevas a bases de datos existentes
function ensureColumn(table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some(c => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
  }
}

ensureColumn('users', 'kyc_estado', "kyc_estado TEXT NOT NULL DEFAULT 'no_iniciado'");
ensureColumn('users', 'kyc_nivel', 'kyc_nivel INTEGER NOT NULL DEFAULT 1');
ensureColumn('users', 'fecha_nacimiento', 'fecha_nacimiento TEXT');
ensureColumn('users', 'direccion', 'direccion TEXT');
ensureColumn('users', 'ciudad', 'ciudad TEXT');
ensureColumn('users', 'tipo_documento', 'tipo_documento TEXT');
ensureColumn('users', 'numero_documento', 'numero_documento TEXT');
ensureColumn('destinatarios', 'favorito', 'favorito INTEGER NOT NULL DEFAULT 0');
ensureColumn('users', 'is_admin', 'is_admin INTEGER NOT NULL DEFAULT 0');
ensureColumn('transferencias', 'notas_admin', 'notas_admin TEXT');
ensureColumn('tasas_cache', 'manual', 'manual INTEGER NOT NULL DEFAULT 0');

module.exports = db;
