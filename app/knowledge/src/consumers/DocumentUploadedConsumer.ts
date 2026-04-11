import path from 'path';
import { Kafka, Producer } from 'kafkajs';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { KafkaListener, DocumentUploadedEvent, Topics } from '@biagent/common';
import { ingestContent } from '../lib/ingester.js';
import { parseDocument } from '../lib/parser.js';

let _s3: S3Client | null = null;
function getS3(): S3Client {
  if (!_s3) _s3 = new S3Client({ region: process.env.AWS_REGION });
  return _s3;
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export class DocumentUploadedListener extends KafkaListener<DocumentUploadedEvent> {
  topic = Topics.DocumentUploaded as const;

  constructor(kafka: Kafka, producer: Producer, groupIdPrefix: string) {
    super(kafka, producer, groupIdPrefix);
  }

  async onMessage(data: DocumentUploadedEvent['data']): Promise<void> {
    const filename = path.basename(data.s3Key);
    console.log(`[knowledge-agent] document.uploaded — s3Key: ${data.s3Key}`);

    const response = await getS3().send(new GetObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME!,
      Key: data.s3Key,
    }));

    const buffer = await streamToBuffer(response.Body as NodeJS.ReadableStream);
    const text   = await parseDocument(buffer, filename);
    await ingestContent(data.s3Key, filename, text);
  }
}
