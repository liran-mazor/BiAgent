/**
 * Synthesis — gpt-4o-mini reads the top reranked chunks and produces a grounded answer.
 * Pure library: no side effects, no CLI code. Imported by index.ts pipeline.
 */

import OpenAI from 'openai';
import type { RetrievedChunk } from './retriever.js';
import { SYNTHESIS_MODEL } from '../config.js';

// Lazy — instantiated on first call so dotenv has already run by then.
let _client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!_client) _client = new OpenAI();
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

  const response = await getClient().chat.completions.create({
    model: SYNTHESIS_MODEL,
    max_tokens: 1024,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user',   content: `Context:\n\n${contextBlock}\n\nQuestion: ${question}` },
    ],
  });

  const answer = response.choices[0].message.content ?? 'No response generated.';

  // Deduplicate sources — multiple chunks may come from the same file
  const sources = [...new Set(chunks.map(c => c.source))];

  return { answer, sources };
}
