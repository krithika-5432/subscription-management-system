import { AsyncLocalStorage } from 'node:async_hooks';
import pg from 'pg';
import { env } from './environment.js';

// DATE stays a 'YYYY-MM-DD' string so no timezone conversion can shift a billing date.
pg.types.setTypeParser(1082, (value) => value);

export const pool = new pg.Pool({ connectionString: env.databaseUrl, max: 20 });

const txStorage = new AsyncLocalStorage<pg.PoolClient>();

const toCamel = (key: string) => key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());

function camelize<T>(row: Record<string, unknown>): T {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(row)) out[toCamel(key)] = row[key];
  return out as T;
}

/** Runs a parameterized query, joining the current transaction if there is one. Row keys become camelCase. */
export async function query<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
  const executor = txStorage.getStore() ?? pool;
  const result = await executor.query(sql, params as any[]);
  return result.rows.map((row) => camelize<T>(row));
}

export async function queryOne<T = any>(sql: string, params: unknown[] = []): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

export async function withTransaction<T>(fn: () => Promise<T>): Promise<T> {
  if (txStorage.getStore()) return fn();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await txStorage.run(client, fn);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
