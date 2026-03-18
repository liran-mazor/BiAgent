import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import pool from './db.js';

const QueryDatabaseSchema = z.object({
  query: z.string().describe('SQL SELECT query to execute'),
});

const server = new Server(
  {
    name: 'agentiq-sql-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'query_database',
        description:
          'Execute a SELECT SQL query against the PostgreSQL database. Returns query results as JSON array.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'SQL SELECT query to execute',
            },
          },
          required: ['query'],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {

  if (request.params.name === 'query_database') {
    const args = QueryDatabaseSchema.parse(request.params.arguments);

    const trimmedQuery = args.query.trim().toUpperCase();
    if (!trimmedQuery.startsWith('SELECT')) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: 'Only SELECT queries are allowed',
            }),
          },
        ],
      };
    }

    try {
      const result = await pool.query(args.query);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              rows: result.rows,
              rowCount: result.rowCount,
            }),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: error.message,
            }),
          },
        ],
      };
    }
  }

  throw new Error(`Unknown tool: ${request.params.name}`);
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});
