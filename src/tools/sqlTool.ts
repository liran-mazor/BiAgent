import pg from 'pg';
import { Tool, ToolResult } from './types';
import { z } from 'zod';

export const SqlToolParams = z.object({
  query: z.string().describe('SQL query to execute'),
});

export type SqlToolInput = z.infer<typeof SqlToolParams>;

const { Pool } = pg;

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'agentiq',
  password: 'agentiq123',
  database: 'agentiq',
});

export const sqlTool: Tool = {
  name: 'sql_tool',
  description: 'Execute SQL queries on the e-commerce database. Available tables: customers, products, orders, order_items, reviews',
  parameters: SqlToolParams,
  
  execute: async (params: any): Promise<ToolResult> => {
    try {
      // Validate input
      const validated = SqlToolParams.parse(params) as SqlToolInput;
      
      // Security: Only allow SELECT queries
      const query = validated.query.trim().toUpperCase();
      if (!query.startsWith('SELECT')) {
        return {
          success: false,
          error: 'Only SELECT queries are allowed for security reasons',
        };
      }

      // Execute query
      const result = await pool.query(validated.query);
      
      return {
        success: true,
        data: {
          rows: result.rows,
          rowCount: result.rowCount,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
};