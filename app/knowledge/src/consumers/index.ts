import { Kafka } from 'kafkajs';
import { DocumentUploadedListener } from './DocumentUploadedListener.js';

const GROUP_PREFIX = process.env.KAFKA_GROUP_ID ?? 'knowledge-agent';

export function createConsumer() {
  const kafka = new Kafka({
    clientId: 'knowledge-agent',
    brokers: (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(','),
    logLevel: 0,
  });

  let producer: ReturnType<typeof kafka.producer> | null = null;
  let listener: DocumentUploadedListener | null = null;

  return {
    async start(): Promise<void> {
      
      producer = kafka.producer({ idempotent: true });
      await producer.connect();

      listener = new DocumentUploadedListener(kafka, producer, GROUP_PREFIX);
      await listener.listen();

      console.log('[knowledge-agent] consumer started — subscribed to document.uploaded');
    },

    async stop(): Promise<void> {
      if (listener) await listener.disconnect();
      if (producer) await producer.disconnect();
    },
  };
}
