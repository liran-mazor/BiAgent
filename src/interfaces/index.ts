import { Agent } from '../biagent/agent';

async function main() {
  const question = process.argv.slice(2).join(' ');

  try {
    const agent = new Agent();

    await agent.run(question, 'cli');

    await agent.cleanup();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main().catch(console.error);
