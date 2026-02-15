import { pool } from '../database/pool';

async function clearCache() {
  const client = await pool.connect();
  await client.query('DELETE FROM query_cache');
  client.release();
  await pool.end();
}

clearCache();