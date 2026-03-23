import { Kafka, Consumer, Producer, EachMessagePayload } from 'kafkajs';
import { KafkaEvent } from './base-event';

/**
 * Retry delay ladder (ms).
 * retry-1 → 5s  retry-2 → 30s  retry-3 → 60s
 * After all retries are exhausted, message moves to the DLQ topic.
 */
const RETRY_DELAYS_MS = [5_000, 30_000, 60_000];

/**
 * Base Kafka listener with full retry-topic + DLQ pattern.
 *
 * Flow:
 *   main topic → onMessage() fails → publish to {topic}.retry (headers: retry-count, retry-at)
 *   retry topic → wait until retry-at, call onMessage() again
 *   after RETRY_DELAYS_MS.length failures → publish to {topic}.dlq
 *
 * groupId = groupIdPrefix + "." + topic so each listener gets its own independent
 * consumer group (e.g. "biagent-consumer.product.created").
 * groupIdPrefix is passed by the bootstrap (consumers/index.ts) — base-listener
 * has no knowledge of env vars.
 *
 * Subclass only needs to implement:
 *   topic    — which topic to consume
 *   onMessage(data) — business logic
 */
export abstract class KafkaListener<T extends KafkaEvent> {
  abstract topic: T['topic'];
  abstract onMessage(data: T['data']): Promise<void>;

  private consumer!: Consumer;

  private get groupId():    string { return `${this.groupIdPrefix}.${this.topic as string}`; }
  private get retryTopic(): string { return `${this.topic}.retry`; }
  private get dlqTopic():   string { return `${this.topic}.dlq`; }

  constructor(
    private kafka: Kafka,
    private producer: Producer,
    private groupIdPrefix: string,
  ) {}

  async listen(): Promise<void> {
    // Consumer created here so this.topic (set by subclass field) is available
    this.consumer = this.kafka.consumer({ groupId: this.groupId });
    await this.consumer.connect();
    await this.consumer.subscribe({
      topics: [this.topic as string, this.retryTopic],
      fromBeginning: true,
    });

    await this.consumer.run({
      eachMessage: async (payload) => this.handleMessage(payload),
    });
  }

  private async handleMessage({ topic, message }: EachMessagePayload): Promise<void> {
    const data: T['data'] = JSON.parse(message.value!.toString());
    const retryCount = parseInt(message.headers?.['retry-count']?.toString() ?? '0');
    const retryAt    = message.headers?.['retry-at']?.toString();

    // If consuming from the retry topic and the delay hasn't elapsed, wait.
    if (topic === this.retryTopic && retryAt) {
      const remaining = new Date(retryAt).getTime() - Date.now();
      if (remaining > 0) await new Promise(res => setTimeout(res, remaining));
    }

    try {
      await this.onMessage(data);
    } catch (err) {
      await this.handleFailure(data, retryCount, err);
    }
  }

  private async handleFailure(
    data: T['data'],
    retryCount: number,
    error: unknown,
  ): Promise<void> {
    if (retryCount < RETRY_DELAYS_MS.length) {
      const delayMs  = RETRY_DELAYS_MS[retryCount];
      const retryAt  = new Date(Date.now() + delayMs).toISOString();

      await this.producer.send({
        topic: this.retryTopic,
        messages: [{
          value: JSON.stringify(data),
          headers: {
            'retry-count':    String(retryCount + 1),
            'retry-at':       retryAt,
            'original-topic': this.topic as string,
            'error':          String(error),
          },
        }],
      });

      console.warn(`[listener] ${this.topic} → retry ${retryCount + 1}/${RETRY_DELAYS_MS.length} in ${delayMs}ms`);
    } else {
      await this.producer.send({
        topic: this.dlqTopic,
        messages: [{
          value: JSON.stringify(data),
          headers: {
            'retry-count':    String(retryCount),
            'original-topic': this.topic as string,
            'error':          String(error),
            'failed-at':      new Date().toISOString(),
          },
        }],
      });

      console.error(`[listener] ${this.topic} → DLQ after ${retryCount} retries`);
    }
  }

  async disconnect(): Promise<void> {
    await this.consumer.disconnect();
  }
}
