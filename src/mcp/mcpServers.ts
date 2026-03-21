import { MCPServerConfig } from '../mcp/types.js';
import path from 'path';

export const mcpServers: MCPServerConfig[] = [
  {
    command: 'npx',
    args: ['tsx', path.resolve('mcp-server/src/index.ts')],
    env: {
      POSTGRES_HOST: process.env.POSTGRES_HOST || 'localhost',
      POSTGRES_PORT: process.env.POSTGRES_PORT || '5432',
      POSTGRES_USER: process.env.POSTGRES_USER || 'agentiq',
      POSTGRES_PASSWORD: process.env.POSTGRES_PASSWORD || 'agentiq123',
      POSTGRES_DB: process.env.POSTGRES_DB || 'agentiq',
    },
  },
];