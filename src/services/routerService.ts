import Anthropic from '@anthropic-ai/sdk';
import { ROUTER_SYSTEM_PROMPT } from '../agent/routerPrompt.js';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

export async function routeQuery(query: string): Promise<'simple' | 'complex'> {
  console.log('🧭 Routing query with Haiku...');
  
  try {
    const response = await client.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 10,
      system: ROUTER_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Query: "${query}"\n\nClassification:`
        }
      ]
    });

    const textBlock = response.content.find(
      (block): block is Anthropic.TextBlock => block.type === 'text'
    );
    
    const decision = textBlock?.text.trim().toUpperCase();
    
    if (decision === 'SIMPLE') {
      console.log('  → SIMPLE (using Haiku)\n');
      return 'simple';
    } else if (decision === 'COMPLEX') {
      console.log('  → COMPLEX (using Sonnet)\n');
      return 'complex';
    } else {
      // Default to complex if unclear
      console.log(`  → Unclear response "${decision}", defaulting to COMPLEX\n`);
      return 'complex';
    }
  } catch (error) {
    console.error('Router error, defaulting to complex:', error);
    return 'complex';
  }
}