import dotenv from 'dotenv';
dotenv.config();
import { Pool } from 'pg';
import { embedQuery } from './embeddingService';

export const pool = new Pool({
  host: process.env.POSTGRES_HOST,
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB,
});

const SIMILARITY_THRESHOLD = 0.15; // 85% similarity

export async function getCachedResponse(query: string): Promise<string | null> {
  try {
    // Embed the query
    const embedding = await embedQuery(query);
    
    // Search for similar cached queries
    const result = await pool.query(
      `SELECT agent_response, embedding <-> $1 AS distance
       FROM query_cache
       WHERE expires_at > NOW()
       ORDER BY embedding <-> $1
       LIMIT 1`,
      [JSON.stringify(embedding)]
    );
    
    if (result.rows.length === 0) {
      console.log('  → Cache miss');
      return null;
    }

    const { agent_response, distance } = result.rows[0];

    if (distance < SIMILARITY_THRESHOLD) {
      console.log('  → Cache hit');
      return agent_response;
    }
    console.log('  → Cache miss');
    return null;
  } catch (error) {
    console.error('  → ⚠️Cache lookup failed:', error);
    return null;
  }
}

export async function cacheResponse(query: string, response: string): Promise<void> {
  try {
    const embedding = await embedQuery(query);
    const ttlSeconds = determineTTL(query);
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    
    // Pass embedding as JSON string for pgvector
    await pool.query(
      `INSERT INTO query_cache (embedding, agent_response, expires_at)
       VALUES ($1, $2, $3)`,
      [JSON.stringify(embedding), response, expiresAt]  // JSON.stringify is correct
    );
  } catch (error) {
    console.error('⚠️ Cache storage failed:', error);
  }
}

function determineTTL(query: string): number {
  const lowerQuery = query.toLowerCase();
  
  // Real-time queries (6 hours)
  if (lowerQuery.includes('today') || 
      lowerQuery.includes('now') || 
      lowerQuery.includes('current') ||
      lowerQuery.includes('this hour')) {
    return 6 * 60 * 60;  // 6 hours
  }
  
  // Recent queries (1 day)
  if (lowerQuery.includes('this week') || 
      lowerQuery.includes('last week') ||
      lowerQuery.includes('yesterday')) {
    return 24 * 60 * 60;  // 1 day
  }
  
  // Monthly queries (3 days)
  if (lowerQuery.includes('this month') ||
      lowerQuery.includes('last month')) {
    return 3 * 24 * 60 * 60;  // 3 days
  }
  
  // Historical queries (1 month)
  if (lowerQuery.includes('last year') || 
      lowerQuery.includes('last quarter') ||
      lowerQuery.match(/\b(2023|2024|2025)\b/)) {  // Specific years
    return 30 * 24 * 60 * 60;  // 30 days (1 month)
  }
  
  // Default for general queries
  return 24 * 60 * 60;  // 24 hours
}