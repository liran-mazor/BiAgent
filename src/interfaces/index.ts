import { Agent } from '../agent/agent';
import { mcpServers } from '../config/mcpServers';
import { initializeMCPClients, cleanupMCPClients } from '../mcp/bootstrap';

async function main() {
  const question = process.argv.slice(2).join(' ');

  if (!question) {
    console.error('Usage: npm start "your question here"');
    process.exit(1);
  }

  try {
    // Initialize MCP clients outside agent
    const { clients, tools, clientMap } = await initializeMCPClients(mcpServers);

    // Inject into agent
    const agent = new Agent(
      process.env.ANTHROPIC_API_KEY!,
      tools,
      clientMap
    );

    const sessionId = `cli_${Date.now()}`;
    const answer = await agent.run(question, sessionId);

    console.log('\n' + '='.repeat(80));
    console.log('📊 Final Answer:');
    console.log('='.repeat(80));
    console.log(answer);
    console.log('='.repeat(80) + '\n');

    // Cleanup outside agent
    await cleanupMCPClients(clients);
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main().catch(console.error);