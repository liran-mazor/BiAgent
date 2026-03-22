/**
 * Offline ingestion script — chunk → embed → store in pgvector.
 *
 * Run (from repo root):
 *   npm run ingest
 *
 * Scans docs/ for .md files. For each file:
 *   1. Calls gpt-4o-mini (tool_choice forced) to extract {title, doc_type, year}
 *   2. Chunks the document via lib/chunker
 *   3. Embeds all chunks via text-embedding-3-small
 *   4. Upserts into pgvector (idempotent: deletes existing rows first)
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import OpenAI from 'openai';
import { z } from 'zod';
import { chunkDocument } from '../lib/chunker.js';
import { EMBEDDING_MODEL, EXTRACTION_MODEL, DB_CONFIG } from '../config.js';

// ── Config ────────────────────────────────────────────────────────────────────
const EMBEDDING_BATCH_SIZE = 2000; // OpenAI limit is 2048
const DOCS_DIR = path.resolve('docs'); // relative to repo root (CWD when run via npm scripts)
const PREVIEW_CHARS = 600; // chars sent to Haiku for metadata extraction

// ── Clients ───────────────────────────────────────────────────────────────────

const openai = new OpenAI();

const pool = new Pool(DB_CONFIG);

// ── Metadata extraction ───────────────────────────────────────────────────────

const MetadataSchema = z.object({
  title:    z.string(),
  doc_type: z.enum(['strategy', 'policy', 'board_meeting', 'performance_review']),
  year:     z.number().int().nullable(),
});

type DocMeta = z.infer<typeof MetadataSchema>;

// Tool definition passed to the LLM — strict schema, enum-constrained doc_type.
const extractMetadataTool: OpenAI.Chat.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'extract_metadata',
    description: 'Extract structured metadata from a business document.',
    parameters: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Short human-readable document title (e.g. "2026 Annual Plan").',
        },
        doc_type: {
          type: 'string',
          enum: ['strategy', 'policy', 'board_meeting', 'performance_review'],
          description: 'Document classification.',
        },
        year: {
          type: ['integer', 'null'],
          description: 'Primary year the document covers, or null if not applicable.',
        },
      },
      required: ['title', 'doc_type', 'year'],
      additionalProperties: false,
    },
    strict: true,
  },
};

async function extractMetadata(filename: string, text: string): Promise<DocMeta> {
  const preview = text.slice(0, PREVIEW_CHARS);

  const response = await openai.chat.completions.create({
    model: EXTRACTION_MODEL,
    messages: [
      {
        role: 'user',
        content:
          `Filename: ${filename}\n\nDocument preview:\n${preview}\n\n` +
          'Extract the metadata for this document.',
      },
    ],
    tools: [extractMetadataTool],
    // Force the model to call extract_metadata — no free-text fallback.
    tool_choice: { type: 'function', function: { name: 'extract_metadata' } },
  });

  const toolCall = response.choices[0]?.message?.tool_calls?.[0];
  if (!toolCall || toolCall.type !== 'function') throw new Error('LLM did not return a function tool call');

  const parsed = JSON.parse(toolCall.function.arguments);
  // Zod validates types and enum values — throws if the LLM output is invalid.
  return MetadataSchema.parse(parsed);
}

// ── Embedding ─────────────────────────────────────────────────────────────────

async function embedBatch(texts: string[]): Promise<number[][]> {
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts,
  });
  return response.data.map(d => d.embedding);
}

// ── Ingest one file ───────────────────────────────────────────────────────────

async function ingestFile(filename: string): Promise<void> {
  const fullPath = path.join(DOCS_DIR, filename);
  const text = fs.readFileSync(fullPath, 'utf-8');

  // Step 1: extract metadata via LLM
  let meta: DocMeta;
  try {
    meta = await extractMetadata(filename, text);
  } catch (err: any) {
    console.warn(`  ⚠  skipping — metadata extraction failed: ${err.message}`);
    return;
  }
  console.log(`  meta: ${meta.doc_type}, ${meta.year}, "${meta.title}"`);

  // Step 2: chunk
  const chunks = chunkDocument(text, meta.title, meta.doc_type);
  console.log(`  chunks: ${chunks.length}`);

  // Step 3: embed in batches
  const allEmbeddings: number[][] = [];
  for (let i = 0; i < chunks.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = chunks.slice(i, i + EMBEDDING_BATCH_SIZE);
    const embeddings = await embedBatch(batch.map(c => c.text));
    allEmbeddings.push(...embeddings);
  }

  // Step 4: upsert into pgvector (transactional)
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM documents WHERE source = $1', [filename]);

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const vectorLiteral = `[${allEmbeddings[i].join(',')}]`;

      await client.query(
        `INSERT INTO documents (content, embedding, source, doc_type, year, chunk_index)
         VALUES ($1, $2::vector, $3, $4, $5, $6)`,
        [chunk.text, vectorLiteral, filename, meta.doc_type, meta.year, chunk.chunkIndex],
      );
    }

    await client.query('COMMIT');
    console.log(`  ✓  inserted ${chunks.length} chunks`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const files = fs.readdirSync(DOCS_DIR).filter(f => f.endsWith('.md'));
  console.log(`\nIngesting ${files.length} documents from ${DOCS_DIR}\n`);

  for (const filename of files) {
    console.log(`→ ${filename}`);
    await ingestFile(filename);
  }

  await pool.end();
  console.log('\nDone.');
}

main().catch(err => {
  console.error('Ingest failed:', err.message);
  process.exit(1);
});
