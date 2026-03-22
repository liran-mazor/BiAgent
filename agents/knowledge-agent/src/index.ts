import { config } from 'dotenv';
config({ path: '../../.env' });
import { validateEnv } from './validateEnv.js';
validateEnv();

import { createApp } from './app.js';

const PORT = parseInt(process.env.KNOWLEDGE_AGENT_PORT ?? '3001');

const app    = createApp();
const server = app.listen(PORT, () => console.log(`knowledge-agent running on port ${PORT}`));

function shutdown(signal: string): void {
  console.log(`\n${signal} received — shutting down`);
  server.close(() => {
    console.log('knowledge-agent stopped');
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
