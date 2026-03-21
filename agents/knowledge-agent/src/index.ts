import { config } from 'dotenv';
config({ path: '../../.env' }); // npm workspace cwd = agents/knowledge-agent, root .env is 2 levels up
import express from 'express';
import { Pool } from 'pg';
import OpenAI from 'openai';
import { retrieve } from './lib/retriever.js';
import { rerank } from './lib/reranker.js';
import { synthesize } from './lib/synthesizer.js';

const PORT = parseInt(process.env.KNOWLEDGE_AGENT_PORT ?? '3001');

// ── Clients ───────────────────────────────────────────────────────────────────
// Created once at startup, reused across all requests.

const pool = new Pool({
  host:     process.env.POSTGRES_HOST     ?? 'localhost',
  port:     parseInt(process.env.POSTGRES_PORT ?? '5432'),
  user:     process.env.POSTGRES_USER     ?? 'postgres',
  password: process.env.POSTGRES_PASSWORD ?? 'postgres',
  database: process.env.POSTGRES_DB       ?? 'postgres',
});

const openai = new OpenAI();

// ── Express ───────────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());

// ── Agent Card ────────────────────────────────────────────────────────────────

app.get('/.well-known/agent.json', (_req, res) => {
  res.json({
    name: 'knowledge-agent',
    description: 'Retrieves answers grounded in internal business documents using a RAG pipeline (pgvector + Cohere rerank + Haiku synthesis).',
    capabilities: {
      tasks: [
        {
          name: 'query_knowledge',
          description:
            'Answer a question using internal business documents — strategy plans, board decisions, pricing policy, EMEA expansion analysis. ' +
            'Returns a direct answer with source document citations. ' +
            'Use this when the question requires context that lives in documents, not in the database. ' +
            'Examples: "Should we be concerned about the revenue drop?", "What did the board decide about EMEA?", "Can we run a 25% discount on Sports?"',
          input_schema: {
            type: 'object',
            properties: {
              question: {
                type: 'string',
                description: 'The question to answer from internal documents.',
              },
            },
            required: ['question'],
          },
        },
      ],
    },
  });
});

// ── Task handler ──────────────────────────────────────────────────────────────

app.post('/tasks', async (req, res) => {
  const { task, input } = req.body ?? {};

  if (task !== 'query_knowledge') {
    res.status(400).json({ status: 'failed', error: `Unknown task: ${task}` });
    return;
  }

  const { question } = input ?? {};
  if (!question || typeof question !== 'string') {
    res.status(400).json({ status: 'failed', error: 'input.question is required and must be a string' });
    return;
  }

  try {
    const result = await handleQueryKnowledge(question);
    res.json({ status: 'completed', data: result });
  } catch (err: any) {
    console.error('query_knowledge failed:', err.message);
    res.status(500).json({ status: 'failed', error: err.message });
  }
});

// ── RAG Pipeline ──────────────────────────────────────────────────────────────

async function handleQueryKnowledge(question: string) {
  console.log(`  question: "${question}"`);

  // Step 1 — embed question + vector search → top 10 candidates
  const candidates = await retrieve(question, pool, openai);
  console.log(`  retrieved: ${candidates.length} candidates`);

  // Step 2 — cross-encoder reranking → top 5
  const reranked = await rerank(question, candidates);
  console.log(`  reranked: ${reranked.length} chunks`);

  // Step 3 — Haiku reads chunks, produces grounded answer
  const result = await synthesize(question, reranked);
  console.log(`  sources: ${result.sources.join(', ')}`);

  return result;
}

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`knowledge-agent running on port ${PORT}`);
});
