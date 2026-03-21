/**
 * Synthesis — Haiku reads the top reranked chunks and produces a grounded answer.
 * Pure library: no side effects, no CLI code. Imported by index.ts pipeline.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { RetrievedChunk } from './retriever.js';

const MODEL = 'claude-haiku-4-5-20251001';

// Lazy — instantiated on first call so dotenv has already run by then.
let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) _client = new Anthropic();
  return _client;
}

const SYSTEM_PROMPT = `You are a business knowledge assistant.
Answer the question using only the context provided below.
Be concise and direct. Cite which document each fact comes from.
If the context does not contain enough information to answer, say so clearly — do not guess.`;

export interface SynthesisResult {
  answer:  string;
  sources: string[]; // deduplicated list of source filenames
}

export async function synthesize(
  question: string,
  chunks: RetrievedChunk[],
): Promise<SynthesisResult> {
  if (chunks.length === 0) {
    return {
      answer:  'No relevant documents were found to answer this question.',
      sources: [],
    };
  }

  // Sort by chunk_index to restore document reading order before synthesis.
  // Reranking sorts by relevance — but the LLM reads context better when
  // related sentences appear in the order they were written.
  const sorted = [...chunks].sort((a, b) => a.chunk_index - b.chunk_index);

  const contextBlock = sorted
    .map((c, i) => `[${i + 1}] Source: ${c.source}\n${c.content}`)
    .join('\n\n');

  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Context:\n\n${contextBlock}\n\nQuestion: ${question}`,
      },
    ],
  });

  const answer = response.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('');

  // Deduplicate sources — multiple chunks may come from the same file
  const sources = [...new Set(chunks.map(c => c.source))];

  return { answer, sources };
}
