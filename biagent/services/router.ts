import Anthropic from '@anthropic-ai/sdk';
import { ROUTER_SYSTEM_PROMPT } from '../biagent/prompts';
import { MODEL } from '../biagent/models';
import { anthropic } from '../config/clients';

export type RouteResult =
  | { available: true;  pattern: 'FUNCTION_CALL' | 'REACT' }
  | { available: false; response: string }

export async function routeQuery(query: string, openCircuits: string[] = []): Promise<RouteResult> {
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
          description: 'Route the query to the correct execution pattern',
          input_schema: {
            type: 'object',
            properties: {
              pattern: {
                type: 'string',
                enum: ['FUNCTION_CALL', 'REACT'],
              },
              unavailable_response: {
                type: 'string',
                description: 'Set only when the query cannot be answered due to unavailable tools. A clear, friendly explanation for the user.'
              }
            },
            required: ['pattern'],
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

    const { pattern, unavailable_response } = toolUseBlock!.input as {
      pattern: 'FUNCTION_CALL' | 'REACT';
      unavailable_response?: string;
    };

    if (unavailable_response) {
      console.log(`\n  → UNAVAILABLE: ${unavailable_response}`);
      return { available: false, response: unavailable_response };
    }

    console.log(`  ◈ Router         : ${pattern}`);
    return { available: true, pattern };
  } catch (error) {
    console.error('Router error, defaulting to REACT:', error);
    return { available: true, pattern: 'REACT' };  // safe fallback
  }
}
