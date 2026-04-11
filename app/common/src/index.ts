// Kafka infrastructure
export * from './kafka/topics';
export * from './kafka/base-event';
export * from './kafka/base-producer';
export * from './kafka/base-consumer';

// Events (created-only — no updates or deletes)
export * from './events/orders/order-placed-event';
export * from './events/catalog/product-created-event';
export * from './events/customers/customer-registered-event';
export * from './events/backoffice/document-uploaded-event';
export * from './events/reviews/review-created-event';
