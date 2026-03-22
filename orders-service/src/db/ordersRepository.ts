import { Topics, OrderPlacedEvent } from '@biagent/common';
import { pool } from './pool';

type Order = OrderPlacedEvent['data'];

/**
 * Saves the order and enqueues an outbox row — both in one transaction.
 * The outbox worker reads the outbox and publishes to Kafka.
 */
export async function saveOrder(order: Order): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `INSERT INTO orders(id, customer_id, total_amount, placed_at)
       VALUES($1, $2, $3, $4)`,
      [order.id, order.customerId, order.totalAmount, order.placedAt],
    );

    for (const item of order.items) {
      await client.query(
        `INSERT INTO order_items(order_id, product_id, quantity, price)
         VALUES($1, $2, $3, $4)`,
        [order.id, item.productId, item.quantity, item.price],
      );
    }

    await client.query(
      `INSERT INTO outbox(topic, payload) VALUES($1, $2)`,
      [Topics.OrderPlaced, JSON.stringify(order)],
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
