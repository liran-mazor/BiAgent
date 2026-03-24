/**
 * Validates required environment variables at startup.
 * Call once before any clients are instantiated.
 * Exits the process with a clear error if any keys are missing.
 */

interface EnvSpec {
  key: string;
  required: boolean;
  description: string;
}

const BIAGENT_ENV: EnvSpec[] = [
  { key: 'ANTHROPIC_API_KEY',    required: true,  description: 'Claude API' },
  { key: 'ECOMMERCE_JWT_SECRET', required: false, description: 'Kong JWT secret (K8s only, not needed in demo)' },
  { key: 'OPENAI_API_KEY',       required: true,  description: 'Embeddings + extraction' },
  { key: 'TAVILY_API_KEY',       required: true,  description: 'Web search tool' },
{ key: 'AWS_ACCESS_KEY_ID',    required: true,  description: 'S3 chart upload' },
  { key: 'AWS_SECRET_ACCESS_KEY',required: true,  description: 'S3 chart upload' },
  { key: 'AWS_REGION',           required: true,  description: 'S3 chart upload' },
  { key: 'S3_BUCKET_NAME',       required: true,  description: 'S3 chart upload' },
  { key: 'CLICKHOUSE_HOST',      required: false, description: 'ClickHouse analytics (optional)' },
  { key: 'TELEGRAM_BOT_TOKEN',   required: false, description: 'Telegram interface (optional)' },
  { key: 'LANGSMITH_API_KEY',    required: false, description: 'Observability (optional)' },
  { key: 'PICOVOICE_ACCESS_KEY', required: false, description: 'Alfred wake word (optional)' },
];

export function validateEnv(specs: EnvSpec[] = BIAGENT_ENV): void {
  const missing = specs
    .filter(s => s.required && !process.env[s.key])
    .map(s => `  ${s.key.padEnd(26)} — ${s.description}`);

  if (missing.length === 0) return;

  console.error('\n❌  Missing required environment variables:\n');
  missing.forEach(m => console.error(m));
  console.error('\nCheck your .env file and try again.\n');
  process.exit(1);
}
