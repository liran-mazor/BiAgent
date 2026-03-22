/**
 * Reusable ingest pipeline — chunk → embed → upsert into pgvector.
 *
 * Used by:
 *   - scripts/ingest.ts  (batch, reads from disk)
 *   - consumers/DocumentUploadedListener.ts  (event-driven, text from S3)
 */

import OpenAI from 'openai';
import { Pool } from 'pg';
import { z } from 'zod';
import { chunkDocument } from './chunker.js';
import { EMBEDDING_MODEL, EXTRACTION_MODEL, DB_CONFIG } from '../config.js';

const EMBEDDING_BATCH_SIZE = 2000;
const PREVIEW_CHARS = 600;

// Lazy clients — dotenv must have run before first call.
let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) _openai = new OpenAI();
  return _openai;
}

let _pool: Pool | null = null;
export function getPool(): Pool {
  if (!_pool) _pool = new Pool(DB_CONFIG);
  return _pool;
}

// ── Metadata extraction ───────────────────────────────────────────────────────

const MetadataSchema = z.object({
  title:    z.string(),
  doc_type: z.enum(['strategy', 'policy', 'board_meeting', 'performance_review']),
  year:     z.number().int().nullable(),
});

type DocMeta = z.infer<typeof MetadataSchema>;

const extractMetadataTool: OpenAI.Chat.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'extract_metadata',
    description: 'Extract structured metadata from a business document.',
    parameters: {
      type: 'object',
      properties: {
        title:    { type: 'string',              description: 'Short human-readable document title.' },
        doc_type: { type: 'string', enum: ['strategy', 'policy', 'board_meeting', 'performance_review'] },
        year:     { type: ['integer', 'null'],   description: 'Primary year the document covers, or null.' },
      },
      required: ['title', 'doc_type', 'year'],
      additionalProperties: false,
    },
    strict: true,
  },
};

export async function extractMetadata(filename: string, text: string): Promise<DocMeta> {
  const preview = text.slice(0, PREVIEW_CHARS);
  const response = await getOpenAI().chat.completions.create({
    model: EXTRACTION_MODEL,
    messages: [{ role: 'user', content: `Filename: ${filename}\n\nDocument preview:\n${preview}\n\nExtract the metadata for this document.` }],
    tools: [extractMetadataTool],
    tool_choice: { type: 'function', function: { name: 'extract_metadata' } },
  });

  const toolCall = response.choices[0]?.message?.tool_calls?.[0];
  if (!toolCall || toolCall.type !== 'function') throw new Error('LLM did not return a function tool call');
  return MetadataSchema.parse(JSON.parse(toolCall.function.arguments));
}

// ── Embedding ─────────────────────────────────────────────────────────────────

export async function embedBatch(texts: string[]): Promise<number[][]> {
  const response = await getOpenAI().embeddings.create({ model: EMBEDDING_MODEL, input: texts });
  return response.data.map(d => d.embedding);
}

// ── Ingest one document ───────────────────────────────────────────────────────

/**
 * Ingest a document into pgvector.
 *
 * @param source   Stored as the `source` column — S3 key for event-driven ingestion,
 *                 filename for batch ingestion. Used as the idempotency key (DELETE WHERE source = $1).
 * @param filename Passed to the LLM for metadata extraction context.
 * @param text     Plain text content of the document.
 */
export async function ingestContent(source: string, filename: string, text: string): Promise<void> {
  // Step 1: metadata
  const meta = await extractMetadata(filename, text);
  console.log(`  [ingest] meta: ${meta.doc_type}, ${meta.year}, "${meta.title}"`);

  // Step 2: chunk
  const chunks = chunkDocument(text, meta.title, meta.doc_type);
  console.log(`  [ingest] chunks: ${chunks.length}`);

  // Step 3: embed
  const allEmbeddings: number[][] = [];
  for (let i = 0; i < chunks.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = chunks.slice(i, i + EMBEDDING_BATCH_SIZE);
    allEmbeddings.push(...await embedBatch(batch.map(c => c.text)));
  }

  // Step 4: upsert (transactional, idempotent)
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM rag_documents WHERE source = $1', [source]);

    for (let i = 0; i < chunks.length; i++) {
      await client.query(
        `INSERT INTO rag_documents (content, embedding, source, doc_type, year, chunk_index)
         VALUES ($1, $2::vector, $3, $4, $5, $6)`,
        [chunks[i].text, `[${allEmbeddings[i].join(',')}]`, source, meta.doc_type, meta.year, chunks[i].chunkIndex],
      );
    }

    await client.query('COMMIT');
    console.log(`  [ingest] ✓ inserted ${chunks.length} chunks (source: ${source})`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
