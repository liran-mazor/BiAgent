import Anthropic from '@anthropic-ai/sdk';
import { SUMMARY_SYSTEM_PROMPT } from '../biagent/prompts';
import { MODEL } from '../biagent/models';
import { anthropic } from '../config/clients';

export interface StructuredSummary {
  topic: string;
  key_facts: string[];
  resolved_entities: Record<string, string>;
  queries_run: string[];
  open_questions: string[];
}

const FORMAT_SUMMARY_TOOL: Anthropic.Tool = {
  name: 'format_summary',
  description: 'Structure the conversation summary into discrete fields',
  input_schema: {
    type: 'object',
    properties: {
      topic: {
        type: 'string',
        description: 'Primary topic/domain of the conversation (e.g. "revenue analysis", "customer churn")'
      },
      key_facts: {
        type: 'array',
        items: { type: 'string' },
        description: 'Confirmed data points and metrics discovered (e.g. "Q4 revenue was $1.2M")'
      },
      resolved_entities: {
        type: 'object',
        description: 'Named entities referenced in conversation: customers, products, time periods',
        additionalProperties: { type: 'string' }
      },
      queries_run: {
        type: 'array',
        items: { type: 'string' },
        description: 'Tools and queries that were executed (brief description, not full SQL)'
      },
      open_questions: {
        type: 'array',
        items: { type: 'string' },
        description: 'Unresolved questions or pending tasks'
      }
    },
    required: ['topic', 'key_facts', 'resolved_entities', 'queries_run', 'open_questions']
  }
};

const FALLBACK_SUMMARY: StructuredSummary = {
  topic: 'business intelligence',
  key_facts: [],
  resolved_entities: {},
  queries_run: [],
  open_questions: []
};

export async function summarizeHistory(messages: Anthropic.MessageParam[]): Promise<StructuredSummary> {
  const response = await anthropic.messages.create({
    model: MODEL.Simple,
    max_tokens: 1024,
    system: SUMMARY_SYSTEM_PROMPT,
    tools: [FORMAT_SUMMARY_TOOL],
    tool_choice: { type: 'tool', name: 'format_summary' },
    messages: [
      {
        role: 'user',
        content: `Summarize this conversation history:\n\n${JSON.stringify(messages, null, 2)}`
      }
    ]
  });

  const toolUseBlock = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
  );

  return (toolUseBlock?.input as StructuredSummary) ?? FALLBACK_SUMMARY;
}

export function formatSummaryForContext(summary: StructuredSummary, query: string): string {
  const q = query.toLowerCase();
  const parts: string[] = [`[Context: ${summary.topic}]`];

  if (summary.key_facts.length > 0) {
    parts.push(`Facts: ${summary.key_facts.join('; ')}`);
  }

  const entityStr = Object.entries(summary.resolved_entities)
    .map(([k, v]) => `${k}=${v}`)
    .join(', ');
  if (entityStr) {
    parts.push(`Entities: ${entityStr}`);
  }

  const isDataQuery = /revenue|order|customer|product|query|data|chart|forecast|sales|metric/.test(q);
  if (isDataQuery && summary.queries_run.length > 0) {
    parts.push(`Prior queries: ${summary.queries_run.join('; ')}`);
  }

  if (summary.open_questions.length > 0) {
    parts.push(`Pending: ${summary.open_questions.join('; ')}`);
  }

  return parts.join('\n');
}
