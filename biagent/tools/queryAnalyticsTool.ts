import { z } from 'zod';
import { clickhouse } from '../config/clients';
import { Tool, ToolResult } from './types';

export const QueryAnalyticsParams = z.object({
  query: z.string().describe('SQL SELECT query to run against the ClickHouse analytics warehouse'),
});

export const queryAnalyticsTool: Tool<typeof QueryAnalyticsParams> = {
  name: 'query_analytics',
  description: `Execute a SELECT query against the ClickHouse analytics warehouse.

Available tables:
  orders(id, customer_id, total_amount, placed_at DateTime)
  order_items(order_id, product_id, quantity, price, placed_at DateTime)
  products(id, name, category LowCardinality, price, created_at DateTime)
  customers(id, email, name, registered_at DateTime)
  reviews(id, product_id, customer_id, rating UInt8, comment Nullable, created_at DateTime)
  monthly_targets(year, month, category, revenue_target, orders_target Nullable)

Use this for analytical queries: revenue totals, order volumes, product performance, customer counts, ratings, and target vs actual comparisons. Use ClickHouse SQL syntax (toYYYYMM, sumIf, groupBy, etc.).`,

  parameters: QueryAnalyticsParams,

  execute: async (params): Promise<ToolResult> => {
    if (!params.query.trim().toUpperCase().startsWith('SELECT')) {
      return { success: false, error: 'Only SELECT queries are allowed' };
    }

    try {
      const resultSet = await clickhouse.query({
        query: params.query,
        format: 'JSONEachRow',
      });

      const rows = await resultSet.json<unknown[]>();

      return {
        success: true,
        data: { rows, rowCount: rows.length },
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },
};
