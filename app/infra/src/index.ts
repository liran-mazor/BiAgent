import 'dotenv/config';
import { Kafka } from 'kafkajs';
import { initTopics } from './kafka/init-topics.js';
import { initSchema } from './clickhouse/init-schema.js';
import { initPostgres } from './postgres/init-postgres.js';

/**
 * One-shot infrastructure initialiser.
 *
 * Run once before starting any services:
 *   npm run init -w infra          (via npm workspaces)
 *   tsx infra/src/index.ts         (directly)
 *
 * In production this runs as a Kubernetes Job at cluster bootstrap.
 * Both steps are idempotent — safe to re-run.
 *
 * Steps:
 *   1. Create all Kafka topics (skip existing)
 *   2. Run ClickHouse DDL (CREATE TABLE IF NOT EXISTS)
 */
async function main(): Promise<void> {
  const kafka = new Kafka({
    clientId: 'infra-init',
    brokers: (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(','),
  });

  console.log('── Kafka ────────────────────────────────');
  await initTopics(kafka);

  console.log('── ClickHouse ───────────────────────────');
  await initSchema();

  console.log('── Postgres ─────────────────────────────');
  await initPostgres();

  console.log('── Done ─────────────────────────────────');
}

main().catch(err => {
  console.error('[init] fatal:', err);
  process.exit(1);
});
