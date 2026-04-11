export const EMBEDDING_MODEL  = 'text-embedding-3-small';
export const EXTRACTION_MODEL = 'gpt-4o-mini';
export const SYNTHESIS_MODEL  = 'gpt-4o-mini';

export const DOC_TYPES = ['policy', 'board_meeting', 'performance_review'] as const;
export const VALID_YEARS = [2023, 2024, 2025, 2026] as const;

export type DocType = (typeof DOC_TYPES)[number];
export type ValidYear = (typeof VALID_YEARS)[number];

export const DB_CONFIG = {
  host:     process.env.POSTGRES_HOST     ?? 'localhost',
  port:     parseInt(process.env.POSTGRES_PORT ?? '5432'),
  user:     process.env.POSTGRES_USER     ?? 'postgres',
  password: process.env.POSTGRES_PASSWORD ?? 'postgres',
  database: process.env.POSTGRES_DB       ?? 'postgres',
};
