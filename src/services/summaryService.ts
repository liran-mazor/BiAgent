import Anthropic from '@anthropic-ai/sdk';
import { SUMMARY_SYSTEM_PROMPT } from '../agent/prompts';
import { CLAUDE } from '../agent/models';
import { anthropic } from '../config/clients';

export async function summarizeHistory(messages: Anthropic.MessageParam[]): Promise<string> {
  const response = await anthropic.messages.create({
    model: CLAUDE.Haiku,
    max_tokens: 1024,
    system: SUMMARY_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Summarize this conversation history:\n\n${JSON.stringify(messages, null, 2)}`
      }
    ]
  });

  const textBlock = response.content.find(block => block.type === 'text');
  return textBlock?.text || 'No summary generated';
}