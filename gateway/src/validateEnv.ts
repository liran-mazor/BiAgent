const REQUIRED = [
  { key: 'JWT_SECRET',           description: 'Shared secret for JWT verification' },
  { key: 'KNOWLEDGE_AGENT_URL',  description: 'Upstream knowledge-agent URL' },
];

export function validateEnv(): void {
  const missing = REQUIRED
    .filter(s => !process.env[s.key])
    .map(s => `  ${s.key.padEnd(22)} — ${s.description}`);

  if (missing.length === 0) return;

  console.error('\n❌  Missing required environment variables:\n');
  missing.forEach(m => console.error(m));
  console.error('\nCheck your .env file and try again.\n');
  process.exit(1);
}
