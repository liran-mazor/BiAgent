import readline from 'readline';
import { Agent } from '../agent/agent';
import { mcpServers } from '../mcp/mcpServers';
import { initializeMCPClients, cleanupMCPClients } from '../mcp/bootstrap';

export async function runInteractive() {
  console.log('\n🤖 AgentIQ Interactive Mode');
  console.log('Type your questions (or "exit" to quit)\n');

  const { mcpClients, mcpTools, mcpClientMap } = await initializeMCPClients(mcpServers);

  const agent = new Agent(mcpTools, mcpClientMap);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const askQuestion = () => {
    rl.question('You: ', async (question) => {
      if (question.toLowerCase() === 'exit') {
        console.log('\nGoodbye! 👋\n');
        await cleanupMCPClients(mcpClients);
        rl.close();
        process.exit(0);
        return;
      }

      if (!question.trim()) {
        askQuestion();
        return;
      }

      try {
        const answer = await agent.run(question);
        console.log(`\nAgentIQ: ${answer}\n`);
      } catch (error: any) {
        console.error(`\n❌ Error: ${error.message}\n`);
      }

      askQuestion();
    });
  };

  askQuestion();
}