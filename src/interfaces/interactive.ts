import readline from 'readline';
import { validateEnv } from '../utils/validateEnv.js';
validateEnv();
import { Agent } from '../biagent/agent';

export async function runInteractive() {
  console.log('\n🤖 BiAgent Interactive Mode');
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
        const answer = await agent.run(question, 'interactive');
        console.log(`\nBiAgent: ${answer}\n`);
      } catch (error: any) {
        console.error(`\n❌ Error: ${error.message}\n`);
      }

      askQuestion();
    });
  };

  askQuestion();

  async function shutdown(signal: string): Promise<void> {
    console.log(`\n${signal} received — shutting down`);
    rl.close();
    await agent.cleanup();
    process.exit(0);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}
