import express from 'express';
import { retrieve } from './lib/retriever.js';
import { rerank } from './lib/reranker.js';
import { synthesize } from './lib/synthesizer.js';
import { DOC_TYPES, VALID_YEARS } from './config.js';

export function createApp() {
  const app = express();
  app.use(express.json());
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  // ── Agent Card ──────────────────────────────────────────────────────────────

  app.get('/.well-known/agent.json', (_req, res) => {
    res.json({
      name: 'knowledge-agent',
      description:
        'Retrieves answers grounded in internal business documents using a RAG pipeline (pgvector + Cohere rerank + gpt-4o-mini synthesis).',
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
                doc_type: {
                  type: 'string',
                  enum: DOC_TYPES,
                  description: 'Optional. Narrow the search to a specific document type.',
                },
                year: {
                  type: 'integer',
                  enum: VALID_YEARS,
                  description: 'Optional. Narrow the search to a specific year.',
                },
              },
              required: ['question'],
            },
          },
        ],
      },
    });
  });

  // ── Task handler ────────────────────────────────────────────────────────────

  app.post('/tasks', async (req, res) => {
    const { task, input } = req.body ?? {};

    if (task !== 'query_knowledge') {
      res.status(400).json({ status: 'failed', error: `Unknown task: ${task}` });
      return;
    }

    const { question, doc_type, year } = input ?? {};
    if (!question || typeof question !== 'string') {
      res.status(400).json({ status: 'failed', error: 'input.question is required and must be a string' });
      return;
    }

    const TIMEOUT_MS = parseInt(process.env.RAG_TIMEOUT_MS ?? '30000');

    try {
      const result = await Promise.race([
        runPipeline(question, doc_type, year),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`RAG pipeline timed out after ${TIMEOUT_MS}ms`)),
            TIMEOUT_MS,
          ),
        ),
      ]);
      res.json({ status: 'completed', data: result });
    } catch (err: any) {
      console.error('query_knowledge failed:', err.message);
      res.status(500).json({ status: 'failed', error: err.message });
    }
  });

  return app;
}

// ── RAG Pipeline ──────────────────────────────────────────────────────────────

async function runPipeline(question: string, doc_type?: string, year?: number) {
  const short = question.length > 80 ? question.slice(0, 77) + '...' : question;
  console.log(`\n[RAG] "${short}"`);

  const candidates = await retrieve(question, { doc_type, year });
  console.log(`      retrieve : ${candidates.length} candidates`);

  const reranked = await rerank(question, candidates);
  console.log(`      rerank   : ${reranked.length} chunks`);

  const result = await synthesize(question, reranked);
  console.log(`      sources  : ${result.sources.join(', ')}`);
  console.log(`      result   : ${result.answer}`);

  return result;
}
