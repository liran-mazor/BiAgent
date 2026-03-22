import { Pool } from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

function createPool(): Pool {
  return new Pool({
    host:     process.env.POSTGRES_HOST     ?? 'localhost',
    port:     parseInt(process.env.POSTGRES_PORT ?? '5432'),
    user:     process.env.POSTGRES_USER     ?? 'biagent',
    password: process.env.POSTGRES_PASSWORD ?? 'biagent123',
    database: process.env.POSTGRES_DB       ?? 'biagent',
  });
}

async function runSchema(pool: Pool, file: string, label: string): Promise<void> {
  const sql = readFileSync(join(__dirname, file), 'utf-8');
  await pool.query(sql);
  console.log(`[postgres] ${label} schema applied`);
}

/**
 * Applies both Postgres schemas against the same database instance.
 * Both are idempotent (CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS).
 */
export async function initPostgres(): Promise<void> {
  const pool = createPool();
  try {
    await runSchema(pool, 'services-schema.sql',  'services');
    await runSchema(pool, 'pgvector-schema.sql',   'pgvector');
  } finally {
    await pool.end();
  }
}
