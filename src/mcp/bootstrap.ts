import { MCPClient } from './client.js';
import { MCPTool, MCPServerConfig } from './types.js';

export async function initializeMCPClients(
configs: MCPServerConfig[]): Promise<{
  clients: MCPClient[];
  tools: MCPTool[];
  clientMap: Map<string, MCPClient>;
}> {
  const clients: MCPClient[] = [];
  const tools: MCPTool[] = [];
  const clientMap = new Map<string, MCPClient>();

  console.log('Initializing MCP clients...');

  for (const config of configs) {
    const client = new MCPClient(config);
    await client.connect();
    const serverTools = await client.listTools();

    clients.push(client);
    tools.push(...serverTools);

    // Map each tool to its client (for multi-server support)
    serverTools.forEach(tool => {
      clientMap.set(tool.name, client);
    });

    console.log(
      `Connected to MCP server, discovered ${serverTools.length} tools:`,
      serverTools.map(t => t.name)
    );
  }

  return { clients, tools, clientMap };
}

export async function cleanupMCPClients(clients: MCPClient[]): Promise<void> {
  console.log('🧹 Cleaning up MCP clients...');
  for (const client of clients) {
    await client.disconnect();
  }
}