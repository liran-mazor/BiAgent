import { Pool } from 'pg';

export const pool = new Pool({
  host:     process.env.POSTGRES_HOST     ?? 'localhost',
  port:     parseInt(process.env.POSTGRES_PORT ?? '5432'),
  user:     process.env.POSTGRES_USER     ?? 'biagent',
  password: process.env.POSTGRES_PASSWORD ?? 'biagent123',
  database: process.env.POSTGRES_DB       ?? 'biagent',
});
