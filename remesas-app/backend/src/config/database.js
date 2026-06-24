/**
 * Capa de acceso a datos unificada: funciona sobre SQLite (por defecto) o
 * PostgreSQL (si se define DATABASE_URL). Expone una interfaz asíncrona común:
 *
 *   await db.prepare(sql).get(...params)   → una fila o undefined
 *   await db.prepare(sql).all(...params)   → array de filas
 *   await db.prepare(sql).run(...params)   → { changes }
 *   await db.tx(async (q) => { ... })       → transacción
 *   await db.getConfig(clave) / db.setConfig(clave, valor)
 *   await db.init()                         → crea esquema y datos iniciales
 *
 * Los placeholders se escriben siempre con `?`; en Postgres se traducen a $n.
 */
const path = require('path');

const USE_PG = !!process.env.DATABASE_URL;
const driver = USE_PG ? 'pg' : 'sqlite';

let api;

// ─────────────────────────────────────────────────────────────────────────────
// Esquema SQLite (para el modo por defecto)
// ─────────────────────────────────────────────────────────────────────────────
const SQLITE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, nombre TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
    telefono TEXT, rut TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
    kyc_estado TEXT NOT NULL DEFAULT 'no_iniciado' CHECK(kyc_estado IN ('no_iniciado','en_revision','verificado','rechazado')),
    kyc_nivel INTEGER NOT NULL DEFAULT 1, fecha_nacimiento TEXT, direccion TEXT, ciudad TEXT,
    tipo_documento TEXT, numero_documento TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS cuentas_origen (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    banco TEXT NOT NULL, tipo_cuenta TEXT NOT NULL, numero_cuenta TEXT NOT NULL, titular TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS destinatarios (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    nombre TEXT NOT NULL, tipo TEXT NOT NULL CHECK(tipo IN ('banco','pago_movil')),
    banco TEXT, numero_cuenta TEXT, cedula TEXT, telefono TEXT, favorito INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS transferencias (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
    cuenta_origen_id TEXT NOT NULL REFERENCES cuentas_origen(id),
    destinatario_id TEXT NOT NULL REFERENCES destinatarios(id),
    monto_clp REAL NOT NULL, tasa_usd_clp REAL NOT NULL, tasa_usd_ves REAL NOT NULL,
    monto_usd REAL NOT NULL, monto_ves REAL NOT NULL, comision_clp REAL NOT NULL,
    estado TEXT NOT NULL DEFAULT 'pendiente' CHECK(estado IN ('pendiente','procesando','completada','fallida','cancelada')),
    referencia TEXT UNIQUE NOT NULL, notas_admin TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS transferencia_eventos (
    id TEXT PRIMARY KEY, transferencia_id TEXT NOT NULL REFERENCES transferencias(id) ON DELETE CASCADE,
    estado TEXT NOT NULL, descripcion TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS notificaciones (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL DEFAULT 'info', titulo TEXT NOT NULL, mensaje TEXT NOT NULL, meta TEXT,
    leida INTEGER NOT NULL DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS tasas_cache (
    id INTEGER PRIMARY KEY, usd_clp REAL NOT NULL, usd_ves REAL NOT NULL, fuente TEXT,
    manual INTEGER NOT NULL DEFAULT 0, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS configuracion (
    clave TEXT PRIMARY KEY, valor TEXT NOT NULL, descripcion TEXT, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS admin_log (
    id TEXT PRIMARY KEY, admin_id TEXT NOT NULL, admin_nombre TEXT, accion TEXT NOT NULL,
    entidad TEXT, entidad_id TEXT, detalle TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS backup_codes (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code_hash TEXT NOT NULL, usado INTEGER NOT NULL DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS tokens (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL, token_hash TEXT NOT NULL, expira DATETIME NOT NULL,
    usado INTEGER NOT NULL DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_trans_user ON transferencias(user_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_notif_user ON notificaciones(user_id, leida);
  CREATE INDEX IF NOT EXISTS idx_eventos_trans ON transferencia_eventos(transferencia_id);
  CREATE INDEX IF NOT EXISTS idx_admin_log ON admin_log(created_at);
  CREATE INDEX IF NOT EXISTS idx_backup_user ON backup_codes(user_id, usado);
  CREATE INDEX IF NOT EXISTS idx_tokens ON tokens(tipo, token_hash);
`;

const SEED_CONFIG = `
  INSERT INTO configuracion (clave, valor, descripcion) VALUES
    ('comision_pct', '2.5', 'Comisión aplicada a cada transferencia (porcentaje)'),
    ('comision_minima_clp', '0', 'Comisión mínima en CLP (0 = sin mínimo)'),
    ('mensaje_mantenimiento', '', 'Mensaje de mantenimiento visible en la app (vacío = sin mensaje)')
  ON CONFLICT (clave) DO NOTHING
`;

// ─────────────────────────────────────────────────────────────────────────────
// Implementación SQLite (node:sqlite nativo, sin compilación)
// ─────────────────────────────────────────────────────────────────────────────
function crearSqlite() {
  const { DatabaseSync } = require('node:sqlite');
  const fs = require('fs');
  const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/remesas.db');
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const sdb = new DatabaseSync(DB_PATH);
  sdb.exec("PRAGMA journal_mode = WAL");
  sdb.exec("PRAGMA foreign_keys = ON");

  function prepare(sql) {
    const stmt = sdb.prepare(sql);
    return {
      get: async (...p) => stmt.get(...p),
      all: async (...p) => stmt.all(...p),
      run: async (...p) => { const r = stmt.run(...p); return { changes: r.changes, lastID: r.lastInsertRowid }; },
    };
  }

  function ensureColumn(table, column, definition) {
    const cols = sdb.prepare(`PRAGMA table_info(${table})`).all();
    if (!cols.some(c => c.name === column)) sdb.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
  }

  return {
    driver: 'sqlite',
    prepare,
    exec: async (sql) => sdb.exec(sql),
    tx: async (fn) => fn(prepare),
    close: async () => sdb.close(),
    async init() {
      sdb.exec(SQLITE_SCHEMA);
      // Migraciones idempotentes para bases existentes
      ensureColumn('users', 'is_admin', 'is_admin INTEGER NOT NULL DEFAULT 0');
      ensureColumn('transferencias', 'notas_admin', 'notas_admin TEXT');
      ensureColumn('tasas_cache', 'manual', 'manual INTEGER NOT NULL DEFAULT 0');
      ensureColumn('users', 'totp_secret', 'totp_secret TEXT');
      ensureColumn('users', 'totp_enabled', 'totp_enabled INTEGER NOT NULL DEFAULT 0');
      ensureColumn('users', 'email_verificado', 'email_verificado INTEGER NOT NULL DEFAULT 0');
      sdb.exec(SEED_CONFIG);
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Implementación PostgreSQL (pg, asíncrono)
// ─────────────────────────────────────────────────────────────────────────────
function crearPostgres() {
  const { Pool, types } = require('pg');
  // Devolver timestamps como string (compatibilidad con el código que asume
  // strings tipo SQLite) en lugar de objetos Date.
  types.setTypeParser(1114, v => v); // timestamp
  types.setTypeParser(1184, v => v); // timestamptz
  types.setTypeParser(1082, v => v); // date (YYYY-MM-DD como string, igual que SQLite)
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  // Traduce SQL escrito en dialecto SQLite a PostgreSQL.
  function toPg(sql) {
    sql = sql.replace(/strftime\('%Y-%m',\s*'now'\)/gi, "to_char(now(), 'YYYY-MM')");
    sql = sql.replace(/strftime\('%Y-%m',\s*([^)]+)\)/gi, "to_char($1, 'YYYY-MM')");
    sql = sql.replace(/DATE\('now',\s*'-(\d+) days'\)/gi, "(CURRENT_DATE - INTERVAL '$1 days')");
    sql = sql.replace(/DATE\('now'\)/gi, 'CURRENT_DATE');
    sql = sql.replace(/\bDATE\(([^)]+)\)/gi, '($1)::date');
    let i = 0;
    sql = sql.replace(/\?/g, () => `$${++i}`);
    return sql;
  }

  function stmt(runner, sql) {
    const text = toPg(sql);
    return {
      get: async (...p) => (await runner(text, p)).rows[0],
      all: async (...p) => (await runner(text, p)).rows,
      run: async (...p) => { const r = await runner(text, p); return { changes: r.rowCount }; },
    };
  }

  const prepare = (sql) => stmt((t, p) => pool.query(t, p), sql);

  return {
    driver: 'pg',
    prepare,
    exec: async (sql) => { await pool.query(sql); },
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const q = (sql) => stmt((t, p) => client.query(t, p), sql);
        const r = await fn(q);
        await client.query('COMMIT');
        return r;
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    },
    close: async () => pool.end(),
    async init() {
      const fs = require('fs');
      const schema = fs.readFileSync(path.join(__dirname, '../../scripts/pg-schema.sql'), 'utf8');
      await pool.query(schema);
      await pool.query(SEED_CONFIG);
    },
  };
}

api = USE_PG ? crearPostgres() : crearSqlite();

// Helpers de configuración (asíncronos)
api.getConfig = async (clave) => {
  const row = await api.prepare('SELECT valor FROM configuracion WHERE clave=?').get(clave);
  return row ? row.valor : null;
};
api.setConfig = async (clave, valor) => {
  await api.prepare('UPDATE configuracion SET valor=?, updated_at=CURRENT_TIMESTAMP WHERE clave=?').run(String(valor), clave);
};

module.exports = api;
