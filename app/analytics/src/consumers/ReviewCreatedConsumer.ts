import { Kafka, Producer } from 'kafkajs';
import { KafkaListener, ReviewCreatedEvent, Topics } from '@biagent/common';
import { ClickHouseClient } from '@clickhouse/client';
import { BatchBuffer } from '../lib/batchBuffer.js';

type ReviewRow = { id: number; product_id: number; customer_id: number; rating: number; comment: string | null; created_at: string };

export class ReviewCreatedListener extends KafkaListener<ReviewCreatedEvent> {
  topic = Topics.ReviewCreated as const;

  private buffer: BatchBuffer<ReviewRow>;

  constructor(kafka: Kafka, producer: Producer, private ch: ClickHouseClient, groupIdPrefix: string) {
    super(kafka, producer, groupIdPrefix);
    this.buffer = new BatchBuffer(
      items => ch.insert({ table: 'reviews', values: items, format: 'JSONEachRow' }),
    );
    this.buffer.start();
  }

  async onMessage(data: ReviewCreatedEvent['data']): Promise<void> {
    await this.buffer.add({
      id:          data.id,
      product_id:  data.productId,
      customer_id: data.customerId,
      rating:      data.rating,
      comment:     data.comment ?? null,
      created_at:  new Date(data.createdAt).toISOString().replace('T', ' ').slice(0, 19),
    });
    console.log(`[analytics] review ${data.id} — product ${data.productId} rating ${data.rating} buffered`);
  }

  async disconnect(): Promise<void> {
    await this.buffer.stop();
    await super.disconnect();
  }
}
