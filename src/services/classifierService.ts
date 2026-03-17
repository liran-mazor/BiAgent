import Anthropic from '@anthropic-ai/sdk';
import { CLASSIFIER_SYSTEM_PROMPT } from '../agent/prompts';
import { MODEL } from '../agent/models';
import { anthropic } from '../config/clients';

export async function classifyQuery(query: string): Promise<{ model: string }> {
  try {
    const response = await anthropic.messages.create({
      model: MODEL.Simple,
      max_tokens: 100,
      system: CLASSIFIER_SYSTEM_PROMPT,
      tools: [
        {
          name: 'classify_query',
          description: 'Classify the query complexity',
          input_schema: {
            type: 'object',
            properties: {
              complexity: {
                type: 'string',
                enum: ['SIMPLE', 'COMPLEX'],
              },
            },
            required: ['complexity'],
          },
        }
      ],
      tool_choice: { type: 'tool', name: 'classify_query' },
      messages: [
        {
          role: 'user',
          content: `Query: "${query}"\n\nClassification:`
        }
      ]
    });

    const toolUseBlock = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
    );

    const { complexity } = toolUseBlock!.input as { complexity: string };
    const model = complexity === 'SIMPLE' ? MODEL.Simple : MODEL.Smart;

    console.log(`\n  → ${complexity} (using ${complexity === 'SIMPLE' ? 'Haiku' : 'Sonnet'})`);
    return { model };
  } catch (error) {
    console.error('Classifier error, defaulting to complex:', error);
    return { model: MODEL.Smart };
  }
}
