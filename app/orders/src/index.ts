import 'dotenv/config';
const missing = ['POSTGRES_HOST', 'POSTGRES_USER', 'POSTGRES_PASSWORD', 'POSTGRES_DB'].filter(k => !process.env[k]);
if (missing.length) { console.error(`❌  Missing env vars: ${missing.join(', ')}`); process.exit(1); }
import app from './app';

const PORT = parseInt(process.env.ORDERS_SERVICE_PORT ?? '4001');

async function start(): Promise<void> {
  const server = app.listen(PORT, () => console.log(`orders on port ${PORT}`));

  function shutdown(signal: string): void {
    console.log(`\n${signal} — shutting down`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}

start().catch(err => { console.error(err); process.exit(1); });
