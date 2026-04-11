import { Kafka } from 'kafkajs';
import { createClient } from '@clickhouse/client';
import { ProductCreatedConsumer }     from './ProductCreatedConsumer.js';
import { OrderPlacedConsumer }        from './OrderPlacedConsumer.js';
import { CustomerRegisteredConsumer } from './CustomerRegisteredConsumer.js';
import { ReviewCreatedConsumer }      from './ReviewCreatedConsumer.js';
import { CLICKHOUSE_CONFIG } from '../config.js';

export function createConsumer() {
  const kafka = new Kafka({
    clientId: process.env.KAFKA_GROUP_ID,
    brokers:  process.env.KAFKA_BROKERS!.split(','),
    logLevel: 0,
  });
  const ch = createClient(CLICKHOUSE_CONFIG);

  const consumers = [
    new ProductCreatedConsumer(kafka, ch),
    new OrderPlacedConsumer(kafka, ch),
    new CustomerRegisteredConsumer(kafka, ch),
    new ReviewCreatedConsumer(kafka, ch),
  ];

  return {
    async start(): Promise<void> {
      for (const c of consumers) await c.listen();
      console.log('[analytics] consumers started');
    },

    async stop(): Promise<void> {
      for (const c of consumers) await c.disconnect();
      await ch.close();
    },
  };
}
