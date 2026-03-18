import Anthropic from '@anthropic-ai/sdk';
import { ROUTER_SYSTEM_PROMPT } from '../agent/prompts';
import { MODEL } from '../agent/models';
import { anthropic } from '../config/clients';

export interface RoutingResult {
  model: string;
  pattern: string;
  unavailableResponse?: string;
}

export async function routeQuery(query: string, openCircuits: string[] = []): Promise<RoutingResult> {
  try {
    const unavailableContext = openCircuits.length > 0
      ? `\nUnavailable tools: ${openCircuits.join(', ')}`
      : '';

    const response = await anthropic.messages.create({
      model: MODEL.Simple,
      max_tokens: 200,
      system: ROUTER_SYSTEM_PROMPT,
      tools: [
        {
          name: 'route_query',
          description: 'Route the query to the correct model and execution pattern',
          input_schema: {
            type: 'object',
            properties: {
              complexity: {
                type: 'string',
                enum: ['SIMPLE', 'COMPLEX'],
              },
              pattern: {
                type: 'string',
                enum: ['FUNCTION_CALL', 'REACT'],
              },
              unavailable_response: {
                type: 'string',
                description: 'Set only when the query cannot be answered due to unavailable tools. A clear, friendly explanation for the user.'
              }
            },
            required: ['complexity', 'pattern'],
          },
        }
      ],
      tool_choice: { type: 'tool', name: 'route_query' },
      messages: [
        {
          role: 'user',
          content: `Query: "${query}"${unavailableContext}\n\nRoute:`
        }
      ]
    });

    const toolUseBlock = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
    );

    const { complexity, pattern, unavailable_response } = toolUseBlock!.input as {
      complexity: string;
      pattern: string;
      unavailable_response?: string;
    };

    if (unavailable_response) {
      console.log(`\n  → UNAVAILABLE: ${unavailable_response}`);
      return { model: MODEL.Simple, pattern: 'FUNCTION_CALL', unavailableResponse: unavailable_response };
    }

    const model = complexity === 'SIMPLE' ? MODEL.Simple : MODEL.Smart;
    console.log(`\n  → ${complexity} / ${pattern} (using ${complexity === 'SIMPLE' ? 'Haiku' : 'Sonnet'})`);
    return { model, pattern };
  } catch (error) {
    console.error('Router error, defaulting to COMPLEX/REACT:', error);
    return { model: MODEL.Smart, pattern: 'REACT' };  // safe fallback
  }
}
