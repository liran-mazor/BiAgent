import express from 'express';
import { execute } from './lib/executor.js';

export function createApp() {
  const app = express();
  app.use(express.json());

  // ── Agent Card ──────────────────────────────────────────────────────────────

  app.get('/.well-known/agent.json', (_req, res) => {
    res.json({
      name: 'analytics',
      description: 'Executes SELECT queries against the ClickHouse analytics warehouse.',
      capabilities: {
        tasks: [
          {
            name: 'query_analytics',
            description:
              'Execute a SELECT query against the ClickHouse analytics warehouse.\n\n' +
              'Available tables:\n' +
              '  orders(id, customer_id, total_amount, placed_at DateTime)\n' +
              '  order_items(order_id, product_id, quantity, price, placed_at DateTime)\n' +
              '  products(id, name, category LowCardinality, price, created_at DateTime)\n' +
              '  customers(id, email, name, registered_at DateTime)\n' +
              '  reviews(id, product_id, customer_id, rating UInt8, comment Nullable, created_at DateTime)\n' +
              '  monthly_targets(year, month, category, revenue_target, orders_target Nullable)\n\n' +
              'Use ClickHouse SQL syntax (toYYYYMM, sumIf, groupBy, etc.).',
            input_schema: {
              type: 'object',
              properties: {
                sql: { type: 'string', description: 'SELECT query to execute' },
              },
              required: ['sql'],
            },
          },
        ],
      },
    });
  });

  // ── Task handler ────────────────────────────────────────────────────────────

  app.post('/tasks', async (req, res) => {
    const { task, input } = req.body ?? {};

    if (task !== 'query_analytics') {
      res.status(400).json({ status: 'failed', error: `Unknown task: ${task}` });
      return;
    }

    const { sql } = input ?? {};
    if (!sql || typeof sql !== 'string') {
      res.status(400).json({ status: 'failed', error: 'input.sql is required and must be a string' });
      return;
    }

    try {
      const result = await execute(sql);
      res.json({ status: 'completed', data: result });
    } catch (err: any) {
      console.error('[analytics] query failed:', err.message);
      res.status(500).json({ status: 'failed', error: err.message });
    }
  });

  return app;
}
