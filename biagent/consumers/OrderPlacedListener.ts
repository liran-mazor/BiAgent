import { Kafka, Producer } from 'kafkajs';
import { KafkaListener, OrderPlacedEvent, Topics } from '@biagent/common';
import { ClickHouseClient } from '@clickhouse/client';

const toDateTime = (iso: string) =>
  new Date(iso).toISOString().replace('T', ' ').slice(0, 19);

export class OrderPlacedListener extends KafkaListener<OrderPlacedEvent> {
  topic = Topics.OrderPlaced as const;

  constructor(kafka: Kafka, producer: Producer, private ch: ClickHouseClient, groupIdPrefix: string) {
    super(kafka, producer, groupIdPrefix);
  }

  async onMessage(data: OrderPlacedEvent['data']): Promise<void> {
    const placedAt = toDateTime(data.placedAt);

    await this.ch.insert({
      table: 'orders',
      values: [{
        id:           data.id,
        customer_id:  data.customerId,
        total_amount: data.totalAmount,
        placed_at:    placedAt,
      }],
      format: 'JSONEachRow',
    });

    await this.ch.insert({
      table: 'order_items',
      values: data.items.map(item => ({
        order_id:   data.id,
        product_id: item.productId,
        quantity:   item.quantity,
        price:      item.price,
        placed_at:  placedAt,
      })),
      format: 'JSONEachRow',
    });

    console.log(`[consumer] order ${data.id} — ${data.items.length} item(s) written to ClickHouse`);
  }
}
