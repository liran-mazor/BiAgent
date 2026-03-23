import { Kafka, Producer } from 'kafkajs';
import { KafkaListener, OrderPlacedEvent, Topics } from '@biagent/common';
import { ClickHouseClient } from '@clickhouse/client';
import { BatchBuffer } from '../lib/batchBuffer.js';

type OrderRow     = { id: number; customer_id: number; total_amount: number; placed_at: string };
type OrderItemRow = { order_id: number; product_id: number; quantity: number; price: number; placed_at: string };

const toDateTime = (iso: string) => new Date(iso).toISOString().replace('T', ' ').slice(0, 19);

export class OrderPlacedListener extends KafkaListener<OrderPlacedEvent> {
  topic = Topics.OrderPlaced as const;

  private ordersBuffer:    BatchBuffer<OrderRow>;
  private orderItemsBuffer: BatchBuffer<OrderItemRow>;

  constructor(kafka: Kafka, producer: Producer, private ch: ClickHouseClient, groupIdPrefix: string) {
    super(kafka, producer, groupIdPrefix);
    this.ordersBuffer = new BatchBuffer(
      items => ch.insert({ table: 'orders', values: items, format: 'JSONEachRow' }),
    );
    this.orderItemsBuffer = new BatchBuffer(
      items => ch.insert({ table: 'order_items', values: items, format: 'JSONEachRow' }),
    );
    this.ordersBuffer.start();
    this.orderItemsBuffer.start();
  }

  async onMessage(data: OrderPlacedEvent['data']): Promise<void> {
    const placedAt = toDateTime(data.placedAt);

    await this.ordersBuffer.add({
      id:           data.id,
      customer_id:  data.customerId,
      total_amount: data.totalAmount,
      placed_at:    placedAt,
    });

    for (const item of data.items) {
      await this.orderItemsBuffer.add({
        order_id:   data.id,
        product_id: item.productId,
        quantity:   item.quantity,
        price:      item.price,
        placed_at:  placedAt,
      });
    }

    console.log(`[analytics] order ${data.id} — ${data.items.length} item(s) buffered`);
  }

  async disconnect(): Promise<void> {
    await this.ordersBuffer.stop();
    await this.orderItemsBuffer.stop();
    await super.disconnect();
  }
}
