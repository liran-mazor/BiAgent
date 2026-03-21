import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import pool from './db.js';

const server = new McpServer({
  name: 'agentiq-sql-server',
  version: '1.0.0',
});

// Cast avoids TS2589 (type instantiation too deep) in McpServer.tool() generics — SDK 1.26.x known issue
(server as any).tool(
  'query_database',
  'Execute a SELECT SQL query against the PostgreSQL database. Returns query results as JSON array.',
  { query: z.string().describe('SQL SELECT query to execute') },
  async ({ query }: { query: string }) => {
    if (!query.trim().toUpperCase().startsWith('SELECT')) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: 'Only SELECT queries are allowed' }) }],
      };
    }

    try {
      const result = await pool.query(query);
      return {
        content: [{ type: 'text', text: JSON.stringify({ rows: result.rows, rowCount: result.rowCount }) }],
      };
    } catch (error: any) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: error.message }) }],
      };
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});
