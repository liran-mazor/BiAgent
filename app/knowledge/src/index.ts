import 'dotenv/config';
const missing = ['OPENAI_API_KEY', 'COHERE_API_KEY', 'POSTGRES_HOST', 'POSTGRES_USER', 'POSTGRES_PASSWORD', 'POSTGRES_DB', 'KAFKA_BROKERS', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_REGION', 'S3_BUCKET_NAME'].filter(k => !process.env[k]);
if (missing.length) { console.error(`❌  Missing env vars: ${missing.join(', ')}`); process.exit(1); }

import { createApp } from './app.js';
import { createConsumer } from './consumers/index.js';

const PORT = parseInt(process.env.KNOWLEDGE_AGENT_PORT ?? '3001');

const app      = createApp();
const consumer = createConsumer();

const server = app.listen(PORT, () => console.log(`knowledge-agent running on port ${PORT}`));

async function start(): Promise<void> {
  try {
    await consumer.start();
  } catch {
  }
}

async function shutdown(signal: string): Promise<void> {
  console.log(`\n${signal} received — shutting down`);
  await consumer.stop();
  server.close(() => {
    console.log('knowledge-agent stopped');
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

start().catch(err => {
  console.error('[knowledge-agent] consumer startup failed:', err);
  process.exit(1);
});
