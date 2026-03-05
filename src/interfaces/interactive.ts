import readline from 'readline';
import { Agent } from '../agent/agent';

export async function runInteractive() {
  console.log('\n🤖 AgentIQ Interactive Mode');
  console.log('Type your questions (or "exit" to quit)\n');

  const agent = new Agent();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const askQuestion = () => {
    rl.question('You: ', async (question) => {
      if (question.toLowerCase() === 'exit') {
        console.log('\nGoodbye! 👋\n');
        await agent.cleanup();
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
