import path from 'path';
import { Kafka, Producer } from 'kafkajs';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { KafkaListener, DocumentUploadedEvent, Topics } from '@biagent/common';
import { ingestContent } from '../lib/ingester.js';

// Lazy S3 client — instantiated after dotenv has run.
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

export class DocumentUploadedListener extends KafkaListener<DocumentUploadedEvent> {
  topic = Topics.DocumentUploaded as const;

  constructor(kafka: Kafka, producer: Producer, groupIdPrefix: string) {
    super(kafka, producer, groupIdPrefix);
  }

  async onMessage(data: DocumentUploadedEvent['data']): Promise<void> {
    const bucket = process.env.S3_BUCKET_NAME!;
    console.log(`[knowledge-agent] document.uploaded — s3Key: ${data.s3Key}`);

    // Download from S3
    const response = await getS3().send(new GetObjectCommand({ Bucket: bucket, Key: data.s3Key }));
    const text = await streamToString(response.Body as NodeJS.ReadableStream);

    // Ingest — use s3Key as source (idempotency key) and basename as filename hint for LLM
    await ingestContent(data.s3Key, path.basename(data.s3Key), text);
  }
}
