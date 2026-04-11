/**
 * Reranking — Cohere cross-encoder scores each candidate chunk against the question.
 * Pure library: no side effects, no CLI code. Imported by index.ts pipeline.
 *
 * Why this step exists:
 *   Vector search finds topically related chunks (bi-encoder, fast).
 *   Reranking finds chunks that actually answer the question (cross-encoder, slow).
 *   We run it only on the top-K candidates, not the whole table.
 */

import { CohereClient } from 'cohere-ai';
import type { RetrievedChunk } from './retriever.js';

const RERANK_MODEL = 'rerank-v3.5';
const TOP_N = 5; // chunks passed to synthesis after reranking

// Lazy — instantiated on first call so dotenv has already run by then.
let _cohere: CohereClient | null = null;
function getCohere(): CohereClient {
  if (!_cohere) _cohere = new CohereClient({ token: process.env.COHERE_API_KEY });
  return _cohere;
}

export async function rerank(
  question: string,
  chunks: RetrievedChunk[],
): Promise<RetrievedChunk[]> {
  if (chunks.length === 0) return [];

  // Skip reranking if < 6 candidates: no value in Cohere cross-encoder for few chunks.
  if (chunks.length < 6) {
    return chunks;
  }

  // Cohere receives the raw text of each candidate.
  // It reads question + passage together and outputs a relevance score per passage.
  const response = await getCohere().rerank({
    model: RERANK_MODEL,
    query: question,
    documents: chunks.map(c => c.content),
    topN: Math.min(TOP_N, chunks.length),
  });

  // response.results: [{ index, relevanceScore }] sorted best → worst
  // Re-map back to the original chunk objects, replacing similarity with Cohere's score.
  return response.results.map(result => ({
    ...chunks[result.index],
    similarity: result.relevanceScore,
  }));
}
