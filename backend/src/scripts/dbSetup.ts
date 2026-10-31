
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';
import pg from 'pg';

const sqlDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../sql');
const reset = process.argv.includes('--reset');
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set. Copy backend/.env.example to backend/.env first.');

async function ensureDatabase() {
  const target = new URL(url!);
  const dbName = target.pathname.slice(1);
  target.pathname = '/postgres';
  const admin = new pg.Client({ connectionString: target.toString() });
  await admin.connect();
  const { rowCount } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
  if (!rowCount) {
    await admin.query(`CREATE DATABASE ${pg.escapeIdentifier(dbName)}`);
    console.log(`Created database ${dbName}`);
  }
  await admin.end();
}

async function main() {
  await ensureDatabase();
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    if (reset) {
      await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
      console.log('Dropped existing schema');
    }
    const { rows } = await client.query(`SELECT to_regclass('public.users') AS users`);
    if (!rows[0].users) {
      await client.query(readFileSync(path.join(sqlDir, 'schema.sql'), 'utf8'));
      await client.query(readFileSync(path.join(sqlDir, 'seed.sql'), 'utf8'));
      console.log('Applied schema.sql and seed.sql');
    } else {
      console.log('Schema already present');
    }

    await client.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())',
    );
    const migrationsDir = path.join(sqlDir, 'migrations');
    const files = existsSync(migrationsDir) ? readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort() : [];
    for (const file of files) {
      const { rowCount } = await client.query('SELECT 1 FROM schema_migrations WHERE name = $1', [file]);
      if (rowCount) continue;
      await client.query('BEGIN');
      await client.query(readFileSync(path.join(migrationsDir, file), 'utf8'));
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`Applied migration ${file}`);
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
