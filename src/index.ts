import { config } from 'dotenv';
import { AgentIQ } from './agent/agent';

config();

async function main() {
  const agent = new AgentIQ(process.env.ANTHROPIC_API_KEY!);
  
  // Test question
  const question = process.argv[2] || "What are the top 5 products by revenue? Show me a bar chart.";
  
  const answer = await agent.run(question);
  
  console.log('\n' + '='.repeat(50));
  console.log('📊 FINAL ANSWER:');
  console.log('='.repeat(50));
  console.log(answer);
  console.log('='.repeat(50) + '\n');
}

main().catch(console.error);
