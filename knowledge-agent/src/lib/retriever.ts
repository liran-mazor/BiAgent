/**
 * Vector retrieval — embed question → pgvector cosine search → top-K chunks.
 * Pure library: no side effects, no CLI code. Imported by index.ts pipeline.
 */

import OpenAI from 'openai';
import { Pool } from 'pg';
import { EMBEDDING_MODEL, DB_CONFIG } from '../config.js';

const TOP_K = 20; // candidates before reranking

// Lazy — instantiated on first call so dotenv has already run by then.
let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) _openai = new OpenAI();
  return _openai;
}

let _pool: Pool | null = null;
function getPool(): Pool {
  if (!_pool) _pool = new Pool(DB_CONFIG);
  return _pool;
}

export interface RetrievedChunk {
  content:     string;
  source:      string;
  doc_type:    string;
  year:        number | null;
  chunk_index: number;
  similarity:  number;
}

// ── Pre-filter heuristics ─────────────────────────────────────────────────────
// Narrows the vector search to a subset of documents before computing similarity.
// Cheap alternative to searching the entire table.
// Only applies a filter when the question clearly signals a doc type or year.

interface Filters {
  doc_type?: string;
  year?:     number;
}

function inferFilters(question: string): Filters {
  const q = question.toLowerCase();
  const filters: Filters = {};

  // doc_type — only filter when the signal is unambiguous
  if (/policy|discount|margin|price|pricing|markup|markdown/.test(q)) {
    filters.doc_type = 'policy';
  } else if (/board|decided|decision|greenlit|approved/.test(q)) {
    filters.doc_type = 'board_meeting';
  } else if (/year.end|year end|review|actual|closed|delivered|h1|h2/.test(q)) {
    filters.doc_type = 'performance_review';
  }

  // year — extract explicit year mention
  if (/\b2026\b/.test(q)) filters.year = 2026;
  else if (/\b2025\b/.test(q)) filters.year = 2025;

  return filters;
}

// ── Retrieve ──────────────────────────────────────────────────────────────────

export async function retrieve(
  question: string,
  embeddingModel: string = EMBEDDING_MODEL,
): Promise<RetrievedChunk[]> {
  // 1. Embed the question — must use the same model used at index time
  const embeddingResponse = await getOpenAI().embeddings.create({
    model: embeddingModel,
    input: question,
  });
  const vectorLiteral = `[${embeddingResponse.data[0].embedding.join(',')}]`;

  // 2. Infer pre-filters from question keywords
  const filters = inferFilters(question);

  // 3. Cosine similarity search
  // `<=>` is pgvector cosine distance (0 = identical, 2 = opposite)
  // `1 - distance` converts to similarity (1 = identical)
  // NULL params disable the filter clause
  const { rows } = await getPool().query<RetrievedChunk & { similarity: number }>(
    `SELECT
       content,
       source,
       doc_type,
       year,
       chunk_index,
       1 - (embedding <=> $1::vector) AS similarity
     FROM rag_documents
     WHERE ($2::text IS NULL OR doc_type = $2)
       AND ($3::int  IS NULL OR year     = $3)
     ORDER BY embedding <=> $1::vector
     LIMIT $4`,
    [
      vectorLiteral,
      filters.doc_type ?? null,
      filters.year     ?? null,
      TOP_K,
    ],
  );

  return rows;
}
