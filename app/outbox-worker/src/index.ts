import 'dotenv/config';
import { Kafka, Producer } from 'kafkajs';
import { Pool } from 'pg';

const POLL_INTERVAL_MS = 500;
const BATCH_SIZE       = 100;
const RETRY_DELAYS_MS  = [5_000, 30_000, 60_000];
const MAX_RETRIES      = RETRY_DELAYS_MS.length;

// ── Clients ───────────────────────────────────────────────────────────────────

const pool = new Pool({
  host:     process.env.POSTGRES_HOST,
  user:     process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB,
});

const kafka = new Kafka({
  clientId: 'outbox-worker',
  brokers:  (process.env.KAFKA_BROKERS ?? 'localhost:29092').split(','),
});

let producer: Producer;

// ── Poll loop ─────────────────────────────────────────────────────────────────

async function poll(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query<{
      id:             string;
      aggregate_type: string;
      aggregate_id:   string;
      type:           string;
      payload:        object;
      retry_count:    number;
    }>(
      `SELECT id, aggregate_type, aggregate_id, type, payload, retry_count
       FROM outbox
       WHERE next_retry_at <= NOW()
       ORDER BY created_at
       LIMIT $1
       FOR UPDATE SKIP LOCKED`,
      [BATCH_SIZE],
    );

    for (const row of rows) {
      try {
        await producer.send({
          topic: row.aggregate_type,
          messages: [{
            key:   row.aggregate_id,
            value: JSON.stringify(row.payload),
            headers: { 'event-type': row.type },
          }],
        });

        await client.query('DELETE FROM outbox WHERE id = $1', [row.id]);
        console.log(`[outbox] published ${row.type} (${row.aggregate_id})`);

      } catch (err) {
        const nextRetryCount = row.retry_count + 1;

        if (row.retry_count >= MAX_RETRIES) {
          // Exhausted — move to DLQ topic and remove from outbox
          await producer.send({
            topic: `${row.aggregate_type}.dlq`,
            messages: [{
              key:   row.aggregate_id,
              value: JSON.stringify(row.payload),
              headers: {
                'event-type': row.type,
                'error':      String(err),
                'failed-at':  new Date().toISOString(),
              },
            }],
          });
          await client.query('DELETE FROM outbox WHERE id = $1', [row.id]);
          console.error(`[outbox] DLQ ${row.type} (${row.aggregate_id}) after ${row.retry_count} retries`);

        } else {
          const delayMs     = RETRY_DELAYS_MS[row.retry_count];
          const nextRetryAt = new Date(Date.now() + delayMs).toISOString();
          await client.query(
            `UPDATE outbox
             SET retry_count   = $1,
                 next_retry_at = $2,
                 last_error    = $3
             WHERE id = $4`,
            [nextRetryCount, nextRetryAt, String(err), row.id],
          );
          console.warn(`[outbox] retry ${nextRetryCount}/${MAX_RETRIES} for ${row.type} (${row.aggregate_id}) in ${delayMs}ms`);
        }
      }
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[outbox] poll error:', err);
  } finally {
    client.release();
  }
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

let timer: NodeJS.Timeout;

async function start(): Promise<void> {
  producer = kafka.producer({
    idempotent:           true,
    maxInFlightRequests:  1,
    retry: {
      retries:      5,
      initialRetryTime: 300,
      maxRetryTime: 30_000,
    },
  });

  await producer.connect();
  console.log('[outbox] started — polling every', POLL_INTERVAL_MS, 'ms');

  const loop = async () => {
    await poll();
    timer = setTimeout(loop, POLL_INTERVAL_MS);
  };

  timer = setTimeout(loop, 0);
}

async function shutdown(signal: string): Promise<void> {
  console.log(`\n${signal} — shutting down outbox worker`);
  clearTimeout(timer);
  await producer.disconnect();
  await pool.end();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

start().catch(err => {
  console.error('[outbox] failed to start:', err);
  process.exit(1);
});
