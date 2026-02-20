import { Agent } from '../agent/agent';
import { mcpServers } from '../mcp/mcpServers';
import { initializeMCPClients, cleanupMCPClients } from '../mcp/bootstrap';
import { initializeA2ATools } from '../a2a/forecastClient';

async function main() {
  const question = process.argv.slice(2).join(' ');

  try {
    const { mcpClients, mcpTools, mcpClientMap } = await initializeMCPClients(mcpServers);
    const a2aTools = await initializeA2ATools();

    const agent = new Agent(
      mcpTools,
      mcpClientMap,
      a2aTools
    );

    const answer = await agent.run(question);

    console.log('\n' + '='.repeat(80));
    console.log('📊 Final Answer:');
    console.log('='.repeat(80));
    console.log(answer);
    console.log('='.repeat(80) + '\n');

    await cleanupMCPClients(mcpClients);
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main().catch(console.error);