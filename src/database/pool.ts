import { Pool } from 'pg';

export const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: process.env.POSTGRES_USER || 'agentiq',
  password: process.env.POSTGRES_PASSWORD || 'agentiq123',
  database: process.env.POSTGRES_DB || 'agentiq',
});