import 'dotenv/config';
const missing = ['CLICKHOUSE_HOST', 'CLICKHOUSE_USER', 'CLICKHOUSE_PASSWORD', 'KAFKA_BROKERS'].filter(k => !process.env[k]);
if (missing.length) { console.error(`❌  Missing env vars: ${missing.join(', ')}`); process.exit(1); }

import { createApp }      from './app.js';
import { createConsumer } from './consumers/index.js';

const PORT = parseInt(process.env.ANALYTICS_PORT ?? '3002');

const app      = createApp();
const consumer = createConsumer();

const server = app.listen(PORT, () => console.log(`analytics running on port ${PORT}`));

async function start(): Promise<void> {
  try {
    await consumer.start();
  } catch {
    console.log('[analytics] Kafka unavailable — consumers disabled');
  }
}

async function shutdown(signal: string): Promise<void> {
  console.log(`\n${signal} received — shutting down`);
  await consumer.stop();
  server.close(() => {
    console.log('analytics stopped');
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

start().catch(err => {
  console.error('[analytics] startup failed:', err);
  process.exit(1);
});
