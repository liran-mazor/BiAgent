import { Kafka, Producer } from 'kafkajs';
import { KafkaEvent } from './base-event';

const RETRIES = 5;
const INITIAL_RETRY_TIME = 300;
const MAX_RETRY_TIME = 30_000;
const FACTOR = 0.2;
const MULTIPLIER = 2;


export interface ProducerConfig {
  /**
   * How many times to retry a failed send before giving up.
   * Covers transient broker errors: leader elections, not-enough-replicas, timeouts.
   * Default: 5
   */
  retries?: number;

  /**
   * Initial delay before the first retry (ms). Doubles each attempt (exponential backoff).
   * Default: 300ms
   */
  initialRetryTime?: number;

  /**
   * Upper bound on retry delay (ms). Backoff will not grow beyond this.
   * Default: 30_000ms
   */
  maxRetryTime?: number;
}

/**
 * Base Kafka producer.
 *
 * Takes a Kafka instance and creates its own idempotent producer, so retry
 * policy is configured once here rather than scattered across services.
 *
 * Idempotent mode (enabled by default):
 *   - Forces acks=-1 (all ISR replicas must acknowledge)
 *   - Forces maxInFlightRequests=1
 *   - Prevents duplicate messages on retry (sequence numbers + producer epoch)
 *
 * One producer instance per topic — create them in your service entry point
 * alongside connect(), and disconnect() on graceful shutdown.
 */
export abstract class KafkaProducer<T extends KafkaEvent> {
  abstract topic: T['topic'];

  private producer: Producer;

  constructor(kafka: Kafka, config: ProducerConfig = {}) {
    this.producer = kafka.producer({
      idempotent: true,     // acks=-1 + exactly-once delivery per partition (up to 5 in-flight)
      retry: {
        retries:         config.retries         ?? RETRIES,
        initialRetryTime: config.initialRetryTime ?? INITIAL_RETRY_TIME,
        maxRetryTime:    config.maxRetryTime    ?? MAX_RETRY_TIME,
        factor:       FACTOR,
        multiplier:   MULTIPLIER,
      },
    });
  }

  async connect(): Promise<void> {
    await this.producer.connect();
  }

  async disconnect(): Promise<void> {
    await this.producer.disconnect();
  }

  async publish(data: T['data']): Promise<void> {
    await this.producer.send({
      topic: this.topic,
      messages: [{ value: JSON.stringify(data) }],
    });
    console.log(`[producer] ${this.topic} published`);
  }
}
