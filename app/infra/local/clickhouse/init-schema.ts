import { createClient } from '@clickhouse/client';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Runs the ClickHouse DDL schema against the configured instance.
 *
 * Reads schema.sql from the same directory and executes each statement
 * individually. All statements use IF NOT EXISTS — safe to run multiple times.
 */
export async function initSchema(): Promise<void> {
  const client = createClient({
    url:      process.env.CLICKHOUSE_HOST     ?? 'http://localhost:8123',
    database: process.env.CLICKHOUSE_DATABASE ?? 'biagent',
    username: process.env.CLICKHOUSE_USER     ?? 'default',
    password: process.env.CLICKHOUSE_PASSWORD ?? '',
  });

  const sql = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');

  // Split on semicolons, remove all comment lines, keep only statements with SQL
  const statements = sql
    .split(';')
    .map(s =>
      s.split('\n')
       .filter(line => !line.trim().startsWith('--'))
       .join('\n')
       .trim()
    )
    .filter(s => s.length > 0);

  for (const statement of statements) {
    await client.exec({ query: statement });
    // Extract table name from the statement for a readable log line
    const match = statement.match(/CREATE TABLE IF NOT EXISTS (\w+)/i);
    if (match) console.log(`[clickhouse] table ready: ${match[1]}`);
  }

  await client.close();
}
