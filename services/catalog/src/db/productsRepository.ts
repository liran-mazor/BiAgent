import { Topics, ProductCreatedEvent } from '@biagent/common';
import { pool } from './pool';

type Product = ProductCreatedEvent['data'];

export async function saveProduct(product: Product): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `INSERT INTO products(id, name, category, price, created_at)
       VALUES($1, $2, $3, $4, $5)`,
      [product.id, product.name, product.category, product.price, product.createdAt],
    );

    await client.query(
      `INSERT INTO outbox(topic, payload) VALUES($1, $2)`,
      [Topics.ProductCreated, JSON.stringify(product)],
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
