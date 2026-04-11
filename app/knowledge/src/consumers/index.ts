import { Kafka } from 'kafkajs';
import { DocumentUploadedConsumer } from './DocumentUploadedConsumer.js';

export function createConsumer() {
  const kafka = new Kafka({
    clientId: process.env.KAFKA_GROUP_ID,
    brokers:  process.env.KAFKA_BROKERS!.split(','),
    logLevel: 0,
  });
  const consumer = new DocumentUploadedConsumer(kafka);

  return {
    async start(): Promise<void> {
      await consumer.listen();
      console.log('[knowledge-agent] consumer started — subscribed to document.uploaded');
    },

    async stop(): Promise<void> {
      await consumer.disconnect();
    },
  };
}
