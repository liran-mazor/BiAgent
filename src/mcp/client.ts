import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { MCPServerConfig, MCPTool } from './types';

export class MCPClient {
  private client: Client;
  private connected: boolean = false;

  constructor(private config: MCPServerConfig) {
    this.client = new Client(
      {
        name: 'agentiq-client',
        version: '1.0.0',
      },
      {
        capabilities: {},
      }
    );
  }

  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    // Filter out undefined values from env
    const cleanEnv: Record<string, string> = {};
    if (this.config.env) {
      Object.entries(this.config.env).forEach(([key, value]) => {
        if (value !== undefined) {
          cleanEnv[key] = value;
        }
      });
    }

    const transport = new StdioClientTransport({
      command: this.config.command,
      args: this.config.args,
      env: { ...process.env as Record<string, string>, ...cleanEnv },
    });

    await this.client.connect(transport);
    this.connected = true;
  }

  async listTools(): Promise<MCPTool[]> {
    if (!this.connected) {
      await this.connect();
    }

    const response = await this.client.listTools();
    return response.tools as MCPTool[];
  }

  async callTool(name: string, args: any): Promise<any> {
    if (!this.connected) {
      await this.connect();
    }

    const response = await this.client.callTool({
      name,
      arguments: args,
    });

    // Extract text content from response
    const content = response.content as Array<{ type: string; text?: string }>;
    const textContent = content.find((c) => c.type === 'text');
    
    if (textContent && textContent.text) {
      return JSON.parse(textContent.text);
    }

    return response;
  }

  async disconnect(): Promise<void> {
    if (this.connected) {
      await this.client.close();
      this.connected = false;
    }
  }
}