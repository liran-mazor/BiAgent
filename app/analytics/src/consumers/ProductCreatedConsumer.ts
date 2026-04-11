import { Kafka, Producer } from 'kafkajs';
import { KafkaListener, ProductCreatedEvent, Topics } from '@biagent/common';
import { ClickHouseClient } from '@clickhouse/client';
import { BatchBuffer } from '../lib/batchBuffer.js';

type ProductRow = { id: number; name: string; category: string; price: number; created_at: string };

export class ProductCreatedListener extends KafkaListener<ProductCreatedEvent> {
  topic = Topics.ProductCreated as const;

  private buffer: BatchBuffer<ProductRow>;

  constructor(kafka: Kafka, producer: Producer, private ch: ClickHouseClient, groupIdPrefix: string) {
    super(kafka, producer, groupIdPrefix);
    this.buffer = new BatchBuffer(
      items => ch.insert({ table: 'products', values: items, format: 'JSONEachRow' }),
    );
    this.buffer.start();
  }

  async onMessage(data: ProductCreatedEvent['data']): Promise<void> {
    await this.buffer.add({
      id:         data.id,
      name:       data.name,
      category:   data.category,
      price:      data.price,
      created_at: new Date(data.createdAt).toISOString().replace('T', ' ').slice(0, 19),
    });
    console.log(`[analytics] product ${data.id} — "${data.name}" buffered`);
  }

  async disconnect(): Promise<void> {
    await this.buffer.stop();
    await super.disconnect();
  }
}
