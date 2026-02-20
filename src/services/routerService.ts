import Anthropic from '@anthropic-ai/sdk';
import { ROUTER_SYSTEM_PROMPT } from '../agent/prompts';
import { CLAUDE } from '../agent/models';
import { anthropic } from '../config/clients';

export async function routeQuery(query: string): Promise<string> {
  console.log('🧭 Routing query with Haiku...');
  
  try {
    const response = await anthropic.messages.create({
      model: CLAUDE.Haiku,
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
    
    if (decision?.includes('SIMPLE')) {
      console.log('  → SIMPLE (using Haiku)\n');
      return CLAUDE.Haiku;
    } else {
      console.log('  → COMPLEX (using Sonnet)\n');
      return CLAUDE.Sonnet;
    }
  } catch (error) {
    console.error('Router error, defaulting to complex:', error);
    return CLAUDE.Sonnet;
  }
}