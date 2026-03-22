import { Kafka, Producer } from 'kafkajs';
import { KafkaListener, ReviewCreatedEvent, Topics } from '@biagent/common';
import { ClickHouseClient } from '@clickhouse/client';

export class ReviewCreatedListener extends KafkaListener<ReviewCreatedEvent> {
  topic = Topics.ReviewCreated as const;

  constructor(kafka: Kafka, producer: Producer, private ch: ClickHouseClient, groupIdPrefix: string) {
    super(kafka, producer, groupIdPrefix);
  }

  async onMessage(data: ReviewCreatedEvent['data']): Promise<void> {
    await this.ch.insert({
      table: 'reviews',
      values: [{
        id:          data.id,
        product_id:  data.productId,
        customer_id: data.customerId,
        rating:      data.rating,
        comment:     data.comment ?? null,
        created_at:  new Date(data.createdAt).toISOString().replace('T', ' ').slice(0, 19),
      }],
      format: 'JSONEachRow',
    });

    console.log(`[consumer] review ${data.id} — product ${data.productId} rating ${data.rating} written to ClickHouse`);
  }
}
