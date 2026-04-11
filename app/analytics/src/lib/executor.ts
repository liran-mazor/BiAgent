import { createClient } from '@clickhouse/client';
import { CLICKHOUSE_CONFIG } from '../config.js';

let _ch: ReturnType<typeof createClient> | null = null;
function getClient() {
  if (!_ch) _ch = createClient(CLICKHOUSE_CONFIG);
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
