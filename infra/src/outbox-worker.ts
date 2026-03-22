/**
 * Outbox worker — polls the shared Postgres outbox table and publishes
 * each pending row to the correct Kafka topic.
 *
 * Uses FOR UPDATE SKIP LOCKED so multiple instances can run safely
 * without double-publishing.
 *
 * Env vars:
 *   POSTGRES_HOST / PORT / USER / PASSWORD / DB  — service DB connection
 *   KAFKA_BROKERS                                  — comma-separated brokers
 *   OUTBOX_POLL_INTERVAL_MS                        — default 1000 ms
 *   OUTBOX_BATCH_SIZE                              — rows per poll cycle, default 100
 */
import 'dotenv/config';
import { Pool } from 'pg';
import { Kafka, Producer } from 'kafkajs';

const POLL_INTERVAL = parseInt(process.env.OUTBOX_POLL_INTERVAL_MS ?? '1000');
const BATCH_SIZE    = parseInt(process.env.OUTBOX_BATCH_SIZE ?? '100');

const pool = new Pool({
  host:     process.env.POSTGRES_HOST     ?? 'localhost',
  port:     parseInt(process.env.POSTGRES_PORT ?? '5432'),
  user:     process.env.POSTGRES_USER     ?? 'postgres',
  password: process.env.POSTGRES_PASSWORD ?? 'postgres',
  database: process.env.POSTGRES_DB       ?? 'services',
});

const kafka = new Kafka({
  clientId: 'outbox-worker',
  brokers: (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(','),
});

async function pollOnce(producer: Producer): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query<{ id: string; topic: string; payload: string }>(
      `SELECT id, topic, payload::text AS payload
       FROM outbox
       WHERE published_at IS NULL
       ORDER BY created_at
       LIMIT $1
       FOR UPDATE SKIP LOCKED`,
      [BATCH_SIZE],
    );

    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return 0;
    }

    // Group messages by topic for a single batched send per topic
    const byTopic = new Map<string, { id: string; payload: string }[]>();
    for (const row of rows) {
      const list = byTopic.get(row.topic) ?? [];
      list.push({ id: row.id, payload: row.payload });
      byTopic.set(row.topic, list);
    }

    for (const [topic, messages] of byTopic) {
      await producer.send({
        topic,
        messages: messages.map(m => ({ value: m.payload })),
      });
    }

    const ids = rows.map(r => r.id);
    await client.query(
      `UPDATE outbox SET published_at = NOW() WHERE id = ANY($1)`,
      [ids],
    );

    await client.query('COMMIT');
    return rows.length;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function start(): Promise<void> {
  const producer = kafka.producer({ idempotent: true });
  await producer.connect();
  console.log('outbox-worker started');

  let running = true;

  async function loop(): Promise<void> {
    while (running) {
      try {
        const count = await pollOnce(producer);
        if (count > 0) console.log(`[outbox] published ${count} message(s)`);
      } catch (err) {
        console.error('[outbox] poll error:', err);
      }
      await new Promise(r => setTimeout(r, POLL_INTERVAL));
    }
  }

  async function shutdown(signal: string): Promise<void> {
    console.log(`\n${signal} — shutting down outbox-worker`);
    running = false;
    await producer.disconnect();
    await pool.end();
    process.exit(0);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));

  await loop();
}

start().catch(err => {
  console.error('[outbox-worker] fatal:', err);
  process.exit(1);
});
