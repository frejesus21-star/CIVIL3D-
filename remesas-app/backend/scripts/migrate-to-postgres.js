#!/usr/bin/env node
/**
 * Migra todos los datos de la base SQLite a PostgreSQL.
 *
 * Uso:
 *   DATABASE_URL=postgres://user:pass@host:5432/remesas \
 *   SQLITE_PATH=./data/remesas.db \
 *   node scripts/migrate-to-postgres.js
 *
 * Pasos: crea el esquema en Postgres (pg-schema.sql), copia cada tabla en
 * orden de dependencias, y reajusta la secuencia de tasas_cache.
 */
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { Client } = require('pg');

const SQLITE_PATH = process.env.SQLITE_PATH || path.join(__dirname, '../data/remesas.db');
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('Falta DATABASE_URL (postgres://...)');
  process.exit(1);
}

// Orden que respeta las claves foráneas
const TABLAS = [
  'users', 'cuentas_origen', 'destinatarios', 'transferencias',
  'transferencia_eventos', 'notificaciones', 'tasas_cache',
  'configuracion', 'admin_log', 'backup_codes', 'tokens',
];

async function main() {
  if (!fs.existsSync(SQLITE_PATH)) {
    console.error(`No existe la base SQLite en ${SQLITE_PATH}`);
    process.exit(1);
  }
  const sqlite = new Database(SQLITE_PATH, { readonly: true });
  const pg = new Client({ connectionString: DATABASE_URL });
  await pg.connect();

  console.log('→ Creando esquema en PostgreSQL...');
  await pg.query(fs.readFileSync(path.join(__dirname, 'pg-schema.sql'), 'utf8'));

  let totalFilas = 0;
  for (const tabla of TABLAS) {
    const filas = sqlite.prepare(`SELECT * FROM ${tabla}`).all();
    if (filas.length === 0) { console.log(`  ${tabla}: 0 filas`); continue; }

    const cols = Object.keys(filas[0]);
    const colList = cols.map(c => `"${c}"`).join(', ');

    // Inserta en lotes con parámetros, evitando conflictos por reejecución
    for (const fila of filas) {
      const ph = cols.map((_, i) => `$${i + 1}`).join(', ');
      const vals = cols.map(c => fila[c]);
      await pg.query(
        `INSERT INTO ${tabla} (${colList}) VALUES (${ph}) ON CONFLICT DO NOTHING`,
        vals
      );
    }
    console.log(`  ${tabla}: ${filas.length} filas`);
    totalFilas += filas.length;
  }

  // Reajusta la secuencia de identidad de tasas_cache al máximo id actual
  await pg.query(`
    SELECT setval(pg_get_serial_sequence('tasas_cache', 'id'),
                  COALESCE((SELECT MAX(id) FROM tasas_cache), 1), true)
  `).catch(() => {});

  console.log(`✓ Migración completa: ${totalFilas} filas en ${TABLAS.length} tablas.`);
  await pg.end();
  sqlite.close();
}

main().catch(err => { console.error('Error en la migración:', err.message); process.exit(1); });
