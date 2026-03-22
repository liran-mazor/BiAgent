import { Kafka, Producer } from 'kafkajs';
import { KafkaListener, CustomerRegisteredEvent, Topics } from '@biagent/common';
import { ClickHouseClient } from '@clickhouse/client';

export class CustomerRegisteredListener extends KafkaListener<CustomerRegisteredEvent> {
  topic = Topics.CustomerRegistered as const;

  constructor(kafka: Kafka, producer: Producer, private ch: ClickHouseClient, groupIdPrefix: string) {
    super(kafka, producer, groupIdPrefix);
  }

  async onMessage(data: CustomerRegisteredEvent['data']): Promise<void> {
    await this.ch.insert({
      table: 'customers',
      values: [{
        id:            data.id,
        email:         data.email,
        name:          data.name,
        registered_at: new Date(data.registeredAt).toISOString().replace('T', ' ').slice(0, 19),
      }],
      format: 'JSONEachRow',
    });

    console.log(`[consumer] customer ${data.id} — "${data.name}" written to ClickHouse`);
  }
}
