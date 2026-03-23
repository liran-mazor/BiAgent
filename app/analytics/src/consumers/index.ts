import { Kafka } from 'kafkajs';
import { createClient } from '@clickhouse/client';
import { ProductCreatedListener }    from './ProductCreatedListener.js';
import { OrderPlacedListener }       from './OrderPlacedListener.js';
import { CustomerRegisteredListener } from './CustomerRegisteredListener.js';
import { ReviewCreatedListener }     from './ReviewCreatedListener.js';

const GROUP_PREFIX = process.env.KAFKA_GROUP_ID ?? 'analytics';

export function createConsumer() {
  const kafka = new Kafka({
    clientId: 'analytics',
    brokers: (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(','),
    logLevel: 0,
  });

  const ch = createClient({
    url:      process.env.CLICKHOUSE_HOST     ?? 'http://localhost:8123',
    database: process.env.CLICKHOUSE_DATABASE ?? 'default',
    username: process.env.CLICKHOUSE_USER     ?? 'default',
    password: process.env.CLICKHOUSE_PASSWORD ?? '',
  });

  let producer:  ReturnType<typeof kafka.producer> | null = null;
  let listeners: Array<{ disconnect(): Promise<void> }> = [];

  return {
    async start(): Promise<void> {
      producer = kafka.producer({ idempotent: true });
      await producer.connect();

      listeners = [
        new ProductCreatedListener(kafka, producer, ch, GROUP_PREFIX),
        new OrderPlacedListener(kafka, producer, ch, GROUP_PREFIX),
        new CustomerRegisteredListener(kafka, producer, ch, GROUP_PREFIX),
        new ReviewCreatedListener(kafka, producer, ch, GROUP_PREFIX),
      ];

      for (const listener of listeners) {
        await (listener as any).listen();
      }

      console.log('[analytics] consumers started');
    },

    async stop(): Promise<void> {
      for (const listener of listeners) await listener.disconnect();
      if (producer) await producer.disconnect();
      await ch.close();
    },
  };
}
