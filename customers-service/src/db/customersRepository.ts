import { Topics, CustomerRegisteredEvent } from '@biagent/common';
import { pool } from './pool';

type Customer = CustomerRegisteredEvent['data'];

export async function saveCustomer(customer: Customer): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `INSERT INTO customers(id, email, name, registered_at)
       VALUES($1, $2, $3, $4)`,
      [customer.id, customer.email, customer.name, customer.registeredAt],
    );

    await client.query(
      `INSERT INTO outbox(topic, payload) VALUES($1, $2)`,
      [Topics.CustomerRegistered, JSON.stringify(customer)],
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
