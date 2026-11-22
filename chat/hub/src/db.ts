import pg from 'pg';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { env } from './env.js';

export const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 10 });

export async function q<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
  const r = await pool.query(sql, params);
  return r.rows as T[];
}

export async function one<T = any>(sql: string, params: unknown[] = []): Promise<T | null> {
  return (await q<T>(sql, params))[0] ?? null;
}

/** Creates the database if missing, then applies src/migrations/*.sql once each, in order. */
export async function migrate() {
  const url = new URL(env.DATABASE_URL);
  const dbName = url.pathname.slice(1);
  const adminUrl = new URL(env.DATABASE_URL);
  adminUrl.pathname = '/postgres';
  const admin = new pg.Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  const exists = await admin.query('select 1 from pg_database where datname = $1', [dbName]);
  if (!exists.rowCount) await admin.query(`create database "${dbName.replace(/"/g, '')}" encoding 'UTF8' template template0`);
  await admin.end();

  await q('create table if not exists schema_migrations (name text primary key, applied_at timestamptz default now())');
  const done = new Set((await q<{ name: string }>('select name from schema_migrations')).map((r) => r.name));
  const dir = join(import.meta.dirname, 'migrations');
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
    if (done.has(f)) continue;
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query(readFileSync(join(dir, f), 'utf8'));
      await client.query('insert into schema_migrations(name) values ($1)', [f]);
      await client.query('commit');
      console.log(`[db] applied ${f}`);
    } catch (e) {
      await client.query('rollback');
      throw e;
    } finally {
      client.release();
    }
  }
}
