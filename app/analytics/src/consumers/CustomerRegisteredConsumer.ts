import { Kafka, Producer } from 'kafkajs';
import { KafkaListener, CustomerRegisteredEvent, Topics } from '@biagent/common';
import { ClickHouseClient } from '@clickhouse/client';
import { BatchBuffer } from '../lib/batchBuffer.js';

type CustomerRow = { id: number; email: string; name: string; registered_at: string };

export class CustomerRegisteredListener extends KafkaListener<CustomerRegisteredEvent> {
  topic = Topics.CustomerRegistered as const;

  private buffer: BatchBuffer<CustomerRow>;

  constructor(kafka: Kafka, producer: Producer, private ch: ClickHouseClient, groupIdPrefix: string) {
    super(kafka, producer, groupIdPrefix);
    this.buffer = new BatchBuffer(
      items => ch.insert({ table: 'customers', values: items, format: 'JSONEachRow' }),
    );
    this.buffer.start();
  }

  async onMessage(data: CustomerRegisteredEvent['data']): Promise<void> {
    await this.buffer.add({
      id:            data.id,
      email:         data.email,
      name:          data.name,
      registered_at: new Date(data.registeredAt).toISOString().replace('T', ' ').slice(0, 19),
    });
    console.log(`[analytics] customer ${data.id} — "${data.name}" buffered`);
  }

  async disconnect(): Promise<void> {
    await this.buffer.stop();
    await super.disconnect();
  }
}
