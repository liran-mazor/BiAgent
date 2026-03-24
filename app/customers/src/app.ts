import express, { Request } from 'express';
import { customersRouter } from './routes/customers';
import { authRouter } from './routes/auth';
import { pool } from './db/pool';

// Extend Express Request with userId injected by Kong
declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

const app = express();
app.use(express.json());

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// ── Kong identity middleware ───────────────────────────────────────────────────
// Kong's request-transformer plugin extracts 'sub' from the verified JWT
// and forwards it as x-user-id before the request reaches this service.
// Services never touch the JWT — they just read this header.
app.use((req, _res, next) => {
  const userId = req.headers['x-user-id'];
  if (userId) req.userId = userId as string;
  next();
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/auth', authRouter);
app.use('/customers', customersRouter);

// ── Protected example: GET /customers/me ─────────────────────────────────────
// Shows how any route uses req.userId without touching JWT logic.
app.get('/customers/me', async (req, res) => {
  if (!req.userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const result = await pool.query(
    'SELECT id, email, name, registered_at FROM customers WHERE id = $1',
    [req.userId],
  );
  if (result.rows.length === 0) {
    res.status(404).json({ error: 'Customer not found' });
    return;
  }
  res.json(result.rows[0]);
});

export default app;
