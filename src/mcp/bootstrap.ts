import { MCPClient } from './client.js';
import { MCPTool, MCPServerConfig } from './types.js';

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
    await client.connect();
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