import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import path from 'path';
import { z } from 'zod';

const inputSchema = z.object({
  query: z.string()
});

class MCPClient {
  private client: Client;
  private connected = false;

  constructor() {
    this.client = new Client(
      { name: 'sql-agent-client', version: '1.0.0' },
      { capabilities: {} }
    );
  }

  async connect(): Promise<void> {
    if (this.connected) return;

    const mcpServerPath = path.resolve(__dirname, '../../../mcp-server/src/index.ts');
    const transport = new StdioClientTransport({
      command: 'npx',
      args: ['tsx', mcpServerPath],
      env: {
        ...process.env as Record<string, string>,
        POSTGRES_HOST: process.env.POSTGRES_HOST || 'localhost',
        POSTGRES_PORT: process.env.POSTGRES_PORT || '5432',
        POSTGRES_USER: process.env.POSTGRES_USER || 'agentiq',
        POSTGRES_PASSWORD: process.env.POSTGRES_PASSWORD || 'agentiq123',
        POSTGRES_DB: process.env.POSTGRES_DB || 'agentiq',
      },
    });

    await this.client.connect(transport);
    this.connected = true;
  }

  async callTool(name: string, args: any): Promise<any> {
    if (!this.connected) await this.connect();

    const response = await this.client.callTool({ name, arguments: args });
    const content = response.content as Array<{ type: string; text?: string }>;
    const textContent = content.find(c => c.type === 'text');
    if (textContent?.text) return JSON.parse(textContent.text);
    return response;
  }
}

const mcpClient = new MCPClient();

export async function initializeSqlTool(): Promise<void> {
  const RETRY_ATTEMPTS = 5;
  const RETRY_DELAY_MS = 2000;

  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    try {
      await mcpClient.connect();
      console.log('✅ MCP connection established');
      return;
    } catch (err: any) {
      if (attempt === RETRY_ATTEMPTS) throw err;
      console.log(`⏳ MCP not ready, retrying... (${attempt}/${RETRY_ATTEMPTS})`);
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
    }
  }
}

export async function executeQuery(input: unknown): Promise<any> {
  const { query } = inputSchema.parse(input);
  return mcpClient.callTool('query_database', { query });
}
