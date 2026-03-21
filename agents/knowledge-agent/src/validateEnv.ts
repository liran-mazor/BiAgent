/**
 * Validates required environment variables at startup.
 * Call once before any clients are instantiated.
 * Exits the process with a clear error if any keys are missing.
 */

const KNOWLEDGE_AGENT_ENV = [
  { key: 'OPENAI_API_KEY',    description: 'Embeddings + synthesis' },
  { key: 'COHERE_API_KEY',    description: 'Reranker' },
  { key: 'POSTGRES_HOST',     description: 'PostgreSQL' },
  { key: 'POSTGRES_USER',     description: 'PostgreSQL' },
  { key: 'POSTGRES_PASSWORD', description: 'PostgreSQL' },
  { key: 'POSTGRES_DB',       description: 'PostgreSQL' },
];

export function validateEnv(): void {
  const missing = KNOWLEDGE_AGENT_ENV
    .filter(s => !process.env[s.key])
    .map(s => `  ${s.key.padEnd(20)} — ${s.description}`);

  if (missing.length === 0) return;

  console.error('\n❌  Missing required environment variables:\n');
  missing.forEach(m => console.error(m));
  console.error('\nCheck your .env file and try again.\n');
  process.exit(1);
}
