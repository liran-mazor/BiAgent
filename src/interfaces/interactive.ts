import { config } from 'dotenv';
import { AgentIQ } from '../agent/agent';
import * as readline from 'readline';

config();

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  
  if (!apiKey) {
    console.error('❌ ANTHROPIC_API_KEY not found in .env file');
    process.exit(1);
  }

  const agent = new AgentIQ(apiKey);
  const sessionId = `cli_${Date.now()}`; 
  
  const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
  });

  console.log('🤖 AgentIQ Interactive Mode');
  console.log('Type your questions (or "exit" to quit)\n');

  const askQuestion = () => {
  rl.question('You: ', async (question) => {
    if (question.toLowerCase() === 'exit') {
      console.log('Goodbye!');
      rl.close();
      process.exit(0);
    }

    try {
      const answer = await agent.run(question, sessionId);
      
      const chartUrlMatch = answer.match(/Chart uploaded to S3: (https:\/\/[^\s]+)/);
      if (chartUrlMatch) {
        console.log('\n📊 Chart available at: ' + chartUrlMatch[1] + '\n');
      }

      
      console.log('\n' + '='.repeat(50));
      console.log('📊 AgentIQ:');
      console.log('='.repeat(50));
      console.log(answer);
      console.log('='.repeat(50) + '\n');
    } catch (error) {
      console.error('❌ Error:', error);
    }

    askQuestion();
  });
};

  askQuestion();
}

main();