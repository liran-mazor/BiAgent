-- pgvector schema — knowledge-agent only.
-- Business tables live in services-schema.sql.

CREATE EXTENSION IF NOT EXISTS vector;

-- ── Document chunks (RAG knowledge base) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS rag_documents (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content     TEXT NOT NULL,
  embedding   VECTOR(1536),
  source      TEXT NOT NULL,
  doc_type    TEXT NOT NULL,
  year        INTEGER,
  chunk_index INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rag_documents_embedding
  ON rag_documents USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS idx_rag_documents_doc_type ON rag_documents(doc_type);
CREATE INDEX IF NOT EXISTS idx_rag_documents_year     ON rag_documents(year);

-- ── Semantic query cache (deferred — not yet wired) ──────────────────────────
CREATE TABLE IF NOT EXISTS query_cache (
  id             SERIAL PRIMARY KEY,
  embedding      VECTOR(1536) NOT NULL,
  agent_response TEXT NOT NULL,
  created_at     TIMESTAMP DEFAULT NOW(),
  expires_at     TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_query_cache_expires   ON query_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_query_cache_embedding ON query_cache
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
