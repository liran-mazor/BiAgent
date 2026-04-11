import 'dotenv/config';

import { createApp } from './app.js';
import { createConsumer } from './consumers/index.js';
import { initParser } from './lib/parser.js';

const PORT = parseInt(process.env.KNOWLEDGE_AGENT_PORT ?? '3001');

const app      = createApp();
const consumer = createConsumer();

const server = app.listen(PORT, () => console.log(`knowledge-agent running on port ${PORT}`));

async function start(): Promise<void> {
  try {
    await initParser();
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
