import { createClient } from '@clickhouse/client';

let _ch: ReturnType<typeof createClient> | null = null;
function getClient() {
  if (!_ch) _ch = createClient({
    url:      process.env.CLICKHOUSE_HOST     ?? 'http://localhost:8123',
    database: process.env.CLICKHOUSE_DATABASE ?? 'biagent',
    username: process.env.CLICKHOUSE_USER     ?? 'biagent',
    password: process.env.CLICKHOUSE_PASSWORD ?? 'biagent123',
  });
  return _ch;
}

export async function execute(sql: string): Promise<{ rows: unknown[]; rowCount: number }> {
  if (!sql.trim().toUpperCase().startsWith('SELECT')) {
    throw new Error('Only SELECT queries are allowed');
  }

  const resultSet = await getClient().query({ query: sql, format: 'JSONEachRow' });
  const rows = await resultSet.json<unknown[]>();
  return { rows, rowCount: rows.length };
}
