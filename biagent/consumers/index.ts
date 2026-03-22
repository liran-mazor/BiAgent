/**
 * BiAgent Kafka consumer — writes incoming events to the ClickHouse read model.
 *
 * Start with:
 *   npm run consumer          (root)
 *   tsx biagent/consumers/index.ts
 *
 * Required env vars:
 *   KAFKA_BROKERS             — comma-separated (default: localhost:9092)
 *   KAFKA_GROUP_ID            — consumer group (default: biagent-consumer)
 *   CLICKHOUSE_HOST           — HTTP URL (default: http://localhost:8123)
 *   CLICKHOUSE_DATABASE       — (default: default)
 *   CLICKHOUSE_USER / CLICKHOUSE_PASSWORD
 */
import 'dotenv/config';
import { Kafka } from 'kafkajs';
import { createClient } from '@clickhouse/client';
import { ProductCreatedListener } from './ProductCreatedListener';
import { OrderPlacedListener } from './OrderPlacedListener';
import { CustomerRegisteredListener } from './CustomerRegisteredListener';
import { ReviewCreatedListener } from './ReviewCreatedListener';

const kafka = new Kafka({
  clientId: 'biagent-consumer',
  brokers: (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(','),
});

const ch = createClient({
  url:      process.env.CLICKHOUSE_HOST     ?? 'http://localhost:8123',
  database: process.env.CLICKHOUSE_DATABASE ?? 'default',
  username: process.env.CLICKHOUSE_USER     ?? 'default',
  password: process.env.CLICKHOUSE_PASSWORD ?? '',
});

const GROUP_PREFIX = process.env.KAFKA_GROUP_ID ?? 'biagent-consumer';

async function start(): Promise<void> {
  // Shared producer — used by all listeners for retry / DLQ publishing
  const producer = kafka.producer({ idempotent: true });
  await producer.connect();

  const listeners = [
    new ProductCreatedListener(kafka, producer, ch, GROUP_PREFIX),
    new OrderPlacedListener(kafka, producer, ch, GROUP_PREFIX),
    new CustomerRegisteredListener(kafka, producer, ch, GROUP_PREFIX),
    new ReviewCreatedListener(kafka, producer, ch, GROUP_PREFIX),
  ];

  for (const listener of listeners) {
    await listener.listen();
  }

  console.log(`biagent-consumer started (group prefix: ${GROUP_PREFIX})`);

  async function shutdown(signal: string): Promise<void> {
    console.log(`\n${signal} — shutting down consumer`);
    for (const listener of listeners) {
      await listener.disconnect();
    }
    await producer.disconnect();
    await ch.close();
    process.exit(0);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}

start().catch(err => {
  console.error('[consumer] fatal:', err);
  process.exit(1);
});
