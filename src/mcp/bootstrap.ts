import { MCPClient } from './client.js';
import { MCPTool, MCPServerConfig } from './types.js';

async function connectWithRetry(client: MCPClient) {
  const RETRY_ATTEMPTS = 5;
  const RETRY_DELAY_MS = 2000;

  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    try {
      await client.connect();
      return;
    } catch {
      if (attempt === RETRY_ATTEMPTS) throw new Error(`MCP server not ready after ${RETRY_ATTEMPTS} attempts`);
      console.log(`⏳ Waiting for MCP server ... (${attempt}/${RETRY_ATTEMPTS})`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }
}

export async function initializeMCPClients(
configs: MCPServerConfig[]): Promise<{
  mcpClients: MCPClient[];
  mcpTools: MCPTool[];
  mcpClientMap: Map<string, MCPClient>;
}> {
  const mcpClients: MCPClient[] = [];
  const mcpTools: MCPTool[] = [];
  const mcpClientMap = new Map<string, MCPClient>();

  console.log('Initializing MCP clients...');

  for (const config of configs) {
    const client = new MCPClient(config);
    await connectWithRetry(client)
    const serverTools = await client.listTools();

    mcpClients.push(client);
    mcpTools.push(...serverTools);

    // Map each tool to its client (for multi-server support)
    serverTools.forEach(tool => {
      mcpClientMap.set(tool.name, client);
    });

  }

  return { mcpClients, mcpTools, mcpClientMap };
}

export async function cleanupMCPClients(clients: MCPClient[]): Promise<void> {
  console.log('🧹 Cleaning up MCP clients...');
  for (const client of clients) {
    await client.disconnect();
  }
}