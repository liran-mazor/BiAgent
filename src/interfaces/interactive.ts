import readline from 'readline';
import { Agent } from '../agent/agent';
import { mcpServers } from '../config/mcpServers';
import { initializeMCPClients, cleanupMCPClients } from '../mcp/bootstrap';

export async function runInteractive() {
  console.log('\n🤖 AgentIQ Interactive Mode');
  console.log('Type your questions (or "exit" to quit)\n');

  // Initialize MCP clients
  const { clients, tools, clientMap } = await initializeMCPClients(mcpServers);

  // Inject into agent
  const agent = new Agent(
    process.env.ANTHROPIC_API_KEY!,
    tools,
    clientMap
  );

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const sessionId = `interactive_${Date.now()}`;

  const askQuestion = () => {
    rl.question('You: ', async (question) => {
      if (question.toLowerCase() === 'exit') {
        console.log('\nGoodbye! 👋\n');
        await cleanupMCPClients(clients);
        rl.close();
        process.exit(0);
        return;
      }

      if (!question.trim()) {
        askQuestion();
        return;
      }

      try {
        const answer = await agent.run(question, sessionId, 20);
        console.log(`\nAgentIQ: ${answer}\n`);
      } catch (error: any) {
        console.error(`\n❌ Error: ${error.message}\n`);
      }

      askQuestion();
    });
  };

  askQuestion();
}