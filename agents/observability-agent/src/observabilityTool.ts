import Anthropic from '@anthropic-ai/sdk';
import { Client } from 'langsmith';
import { z } from 'zod';

const inputSchema = z.object({
  question: z.string(),
  limit: z.number().int().positive().optional().default(20)
});

async function fetchRecentTraces(limit: number) {
  const client = new Client({ apiKey: process.env.LANGSMITH_API_KEY! });
  const runs: any[] = [];
  for await (const run of client.listRuns({
    projectName: process.env.LANGSMITH_PROJECT!,
    runType: 'llm',
    limit,
  })) {
    runs.push(run);
  }
  return runs;
}

function summarizeTraces(traces: any[]) {
  return traces.map(t => {
    const usage = t.outputs?.usage;
    return {
      name: t.name,
      latency_ms: t.end_time
        ? Math.round(new Date(t.end_time).getTime() - new Date(t.start_time).getTime())
        : null,
      input_tokens: usage?.input_tokens ?? 0,
      output_tokens: usage?.output_tokens ?? 0,
      cache_read_tokens: usage?.cache_read_input_tokens ?? 0,
      status: t.status,
      error: t.error || null,
    };
  });
}

export async function queryObservability(input: unknown): Promise<{ answer: string }> {
  const { question, limit } = inputSchema.parse(input);

  const traces = await fetchRecentTraces(limit);
  if (!traces.length) {
    return { answer: 'No traces found.' };
  }

  const summary = summarizeTraces(traces);

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  const response = await client.messages.create({
    model: process.env.HAIKU_MODEL || 'claude-haiku-4-5-20251001',
    max_tokens: 500,
    messages: [{
      role: 'user',
      content: `You are analyzing LangSmith traces for a BI agent. Answer the following question based on the trace data below.

Question: ${question}

Plain text only, no markdown, no bullet points. Be concise.

Traces:
${JSON.stringify(summary, null, 2)}`
    }]
  });

  const answer = (response.content[0] as Anthropic.TextBlock).text;
  return { answer };
}
