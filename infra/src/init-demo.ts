import 'dotenv/config';
import { initSchema } from './clickhouse/init-schema.js';
import { initPostgres } from './postgres/init-postgres.js';

// Minimal init for demo/interview mode — no Kafka required.
// Applies ClickHouse DDL and pgvector schema (both idempotent).
async function main(): Promise<void> {
  console.log('── ClickHouse ───────────────────────────');
  await initSchema();

  console.log('── Postgres / pgvector ──────────────────');
  await initPostgres();

  console.log('── Done ─────────────────────────────────');
}

main().catch(err => {
  console.error('[init-demo] fatal:', err);
  process.exit(1);
});
