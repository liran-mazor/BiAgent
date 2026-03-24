import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../db/pool';
import { Topics } from '@biagent/common';

const router = Router();

// POST /auth/signup
// Body: { email, name, password }
// Returns: { token, customer: { id, email, name } }
router.post('/signup', async (req, res) => {
  const { email, name, password } = req.body;

  if (!email || !name || !password) {
    res.status(400).json({ error: 'email, name and password are required' });
    return;
  }

  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    res.status(500).json({ error: 'AUTH_SECRET not configured' });
    return;
  }

  const client = await pool.connect();
  try {
    // Check duplicate email
    const existing = await client.query('SELECT id FROM customers WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      res.status(409).json({ error: 'Email already registered' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const registeredAt = new Date().toISOString();

    // Save customer + outbox atomically
    await client.query('BEGIN');

    const result = await client.query(
      `INSERT INTO customers (email, name, password_hash, registered_at)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [email, name, passwordHash, registeredAt],
    );

    const customerId = result.rows[0].id;

    await client.query(
      `INSERT INTO outbox (aggregate_type, aggregate_id, type, payload) VALUES ($1, $2, $3, $4)`,
      [Topics.CustomerRegistered, String(customerId), 'CustomerRegistered', JSON.stringify({ id: customerId, email, name, registeredAt })],
    );

    await client.query('COMMIT');

    // Sign JWT — Kong will verify this on every subsequent request
    // Kong extracts 'sub' and forwards it as x-user-id header to upstream services
    // iss must match the 'key' field in Kong's app-auth-credential
    const token = jwt.sign({ iss: 'app', sub: customerId, email }, secret, { expiresIn: '7d' });

    res.status(201).json({ token, customer: { id: customerId, email, name } });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

export { router as authRouter };
