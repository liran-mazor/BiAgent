import { Kafka } from 'kafkajs';
import { TOPIC_CONFIG } from '@biagent/common';

/**
 * Creates all Kafka topics defined in TOPIC_CONFIG.
 *
 * Idempotent — safe to run multiple times (existing topics are skipped).
 * replicationFactor is read from KAFKA_REPLICATION_FACTOR env var:
 *   1 in local Docker, 3 in a production multi-broker cluster.
 */
export async function initTopics(kafka: Kafka): Promise<void> {
  const admin = kafka.admin();
  await admin.connect();

  const replicationFactor = parseInt(process.env.KAFKA_REPLICATION_FACTOR ?? '1');

  const topics = (Object.entries(TOPIC_CONFIG) as [string, { numPartitions: number }][]).map(
    ([topic, config]) => ({
      topic,
      numPartitions:     config.numPartitions,
      replicationFactor,
    }),
  );

  const result = await admin.createTopics({
    topics,
    waitForLeaders: true,  // block until partition leaders are elected
  });

  if (result) {
    console.log(`[kafka] created ${topics.length} topics`);
  } else {
    console.log('[kafka] topics already exist — skipped');
  }

  await admin.disconnect();
}
