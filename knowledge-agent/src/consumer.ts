/**
 * knowledge-agent Kafka consumer — event-driven document ingestion.
 *
 * Subscribes to `document.uploaded`, downloads from S3, runs the RAG ingest pipeline.
 * Started alongside the HTTP server in index.ts.
 */

import path from 'path';
import { Kafka } from 'kafkajs';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { Topics, DocumentUploadedEvent } from '@biagent/common';
import { ingestContent } from './lib/ingester.js';

const GROUP_ID = `${process.env.KAFKA_GROUP_ID ?? 'knowledge-agent'}.${Topics.DocumentUploaded}`;

let _s3: S3Client | null = null;
function getS3(): S3Client {
  if (!_s3) _s3 = new S3Client({ region: process.env.AWS_REGION });
  return _s3;
}

async function streamToString(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf-8');
}

async function onDocumentUploaded(data: DocumentUploadedEvent['data']): Promise<void> {
  console.log(`[knowledge-agent] document.uploaded — s3Key: ${data.s3Key}`);
  const response = await getS3().send(new GetObjectCommand({
    Bucket: process.env.S3_BUCKET_NAME!,
    Key: data.s3Key,
  }));
  const text = await streamToString(response.Body as NodeJS.ReadableStream);
  await ingestContent(data.s3Key, path.basename(data.s3Key), text);
}

export function createConsumer() {
  const kafka = new Kafka({
    clientId: 'knowledge-agent',
    brokers: (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(','),
    retry: { retries: 0 },
    logLevel: 0,
  });

  let consumer: ReturnType<typeof kafka.consumer> | null = null;
  let producer: ReturnType<typeof kafka.producer> | null = null;

  return {
    async start(): Promise<void> {
      producer = kafka.producer({ idempotent: true });
      await producer.connect();

      consumer = kafka.consumer({ groupId: GROUP_ID });
      await consumer.connect();
      await consumer.subscribe({ topics: [Topics.DocumentUploaded], fromBeginning: true });

      await consumer.run({
        eachMessage: async ({ message }) => {
          const data: DocumentUploadedEvent['data'] = JSON.parse(message.value!.toString());
          await onDocumentUploaded(data);
        },
      });

      console.log('[knowledge-agent] consumer started — subscribed to document.uploaded');
    },

    async stop(): Promise<void> {
      if (consumer) await consumer.disconnect();
      if (producer) await producer.disconnect();
    },
  };
}
