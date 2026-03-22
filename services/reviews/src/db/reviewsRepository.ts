import { Topics, ReviewCreatedEvent } from '@biagent/common';
import { pool } from './pool';

type Review = ReviewCreatedEvent['data'];

export async function saveReview(review: Review): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `INSERT INTO reviews(id, product_id, customer_id, rating, comment, created_at)
       VALUES($1, $2, $3, $4, $5, $6)`,
      [review.id, review.productId, review.customerId, review.rating, review.comment ?? null, review.createdAt],
    );

    await client.query(
      `INSERT INTO outbox(topic, payload) VALUES($1, $2)`,
      [Topics.ReviewCreated, JSON.stringify(review)],
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
