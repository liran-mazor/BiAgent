export enum Topics {
  // orders-service
  OrderPlaced      = 'order.placed',
  OrderPlacedRetry = 'order.placed.retry',
  OrderPlacedDlq   = 'order.placed.dlq',

  // catalog-service
  ProductCreated      = 'product.created',
  ProductCreatedRetry = 'product.created.retry',
  ProductCreatedDlq   = 'product.created.dlq',

  // customers-service
  CustomerRegistered      = 'customer.registered',
  CustomerRegisteredRetry = 'customer.registered.retry',
  CustomerRegisteredDlq   = 'customer.registered.dlq',

  // backoffice-service
  DocumentUploaded      = 'document.uploaded',
  DocumentUploadedRetry = 'document.uploaded.retry',
  DocumentUploadedDlq   = 'document.uploaded.dlq',

  // reviews-service
  ReviewCreated      = 'review.created',
  ReviewCreatedRetry = 'review.created.retry',
  ReviewCreatedDlq   = 'review.created.dlq',
}

/**
 * Partition config per topic.
 *
 * Business topics scale with expected throughput.
 * Retry + DLQ topics always get 1 partition — low volume, sequential processing is fine.
 *
 * replicationFactor is intentionally excluded here — it depends on the number of
 * brokers in the cluster. Read it from KAFKA_REPLICATION_FACTOR env var at runtime
 * (1 for local Docker, 3 for production K8s).
 */
export const TOPIC_CONFIG: Record<Topics, { numPartitions: number }> = {
  // orders — highest volume
  [Topics.OrderPlaced]:      { numPartitions: 3 },
  [Topics.OrderPlacedRetry]: { numPartitions: 1 },
  [Topics.OrderPlacedDlq]:   { numPartitions: 1 },

  // catalog — admin-driven, low volume
  [Topics.ProductCreated]:      { numPartitions: 1 },
  [Topics.ProductCreatedRetry]: { numPartitions: 1 },
  [Topics.ProductCreatedDlq]:   { numPartitions: 1 },

  // customers — moderate volume (signups)
  [Topics.CustomerRegistered]:      { numPartitions: 2 },
  [Topics.CustomerRegisteredRetry]: { numPartitions: 1 },
  [Topics.CustomerRegisteredDlq]:   { numPartitions: 1 },

  // backoffice — very low volume
  [Topics.DocumentUploaded]:      { numPartitions: 1 },
  [Topics.DocumentUploadedRetry]: { numPartitions: 1 },
  [Topics.DocumentUploadedDlq]:   { numPartitions: 1 },

  // reviews — moderate volume
  [Topics.ReviewCreated]:      { numPartitions: 2 },
  [Topics.ReviewCreatedRetry]: { numPartitions: 1 },
  [Topics.ReviewCreatedDlq]:   { numPartitions: 1 },
};
