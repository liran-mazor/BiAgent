import { Kafka, Producer } from 'kafkajs';
import { KafkaListener, ProductCreatedEvent, Topics } from '@biagent/common';
import { ClickHouseClient } from '@clickhouse/client';

export class ProductCreatedListener extends KafkaListener<ProductCreatedEvent> {
  topic = Topics.ProductCreated as const;

  constructor(kafka: Kafka, producer: Producer, private ch: ClickHouseClient, groupIdPrefix: string) {
    super(kafka, producer, groupIdPrefix);
  }

  async onMessage(data: ProductCreatedEvent['data']): Promise<void> {
    await this.ch.insert({
      table: 'products',
      values: [{
        id:         data.id,
        name:       data.name,
        category:   data.category,
        price:      data.price,
        created_at: new Date(data.createdAt).toISOString().replace('T', ' ').slice(0, 19),
      }],
      format: 'JSONEachRow',
    });

    console.log(`[consumer] product ${data.id} — "${data.name}" written to ClickHouse`);
  }
}
