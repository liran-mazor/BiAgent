-- 1. Enable extensions first
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Create the query_cache table
CREATE TABLE IF NOT EXISTS query_cache (
  id SERIAL PRIMARY KEY,
  embedding VECTOR(1536) NOT NULL,
  agent_response TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL
);

-- 3. Create indexes
CREATE INDEX IF NOT EXISTS idx_expires ON query_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_created ON query_cache(created_at);
CREATE INDEX IF NOT EXISTS idx_embedding ON query_cache
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Customers table
CREATE TABLE customers (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Products table
CREATE TABLE products (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(100) NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Orders table
CREATE TABLE orders (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER REFERENCES customers(id),
  total_amount DECIMAL(10, 2) NOT NULL,
  status VARCHAR(50) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Order items table
CREATE TABLE order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER REFERENCES orders(id),
  product_id INTEGER REFERENCES products(id),
  quantity INTEGER NOT NULL,
  price DECIMAL(10, 2) NOT NULL
);

-- Documents table (RAG knowledge base)
CREATE TABLE IF NOT EXISTS documents (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content     TEXT NOT NULL,     -- "[doc title | doc_type]: " prepended + chunk text (what gets embedded)
  embedding   VECTOR(1536),
  source      TEXT NOT NULL,     -- filename e.g. "2026-annual-plan.md"
  doc_type    TEXT NOT NULL,     -- "strategy" | "policy" | "board_meeting" | "performance_review"
  year        INTEGER,           -- document year for temporal pre-filtering (2025, 2026)
  chunk_index INTEGER NOT NULL DEFAULT 0, -- position in document, used to re-sort chunks before synthesis
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_documents_embedding
  ON documents USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS idx_documents_doc_type ON documents(doc_type);
CREATE INDEX IF NOT EXISTS idx_documents_year ON documents(year);

-- Monthly revenue and order targets per category (from annual plan docs)
CREATE TABLE monthly_targets (
  id            SERIAL PRIMARY KEY,
  year          INTEGER NOT NULL,
  month         INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  category      VARCHAR(100) NOT NULL,
  revenue_target DECIMAL(10, 2) NOT NULL,
  orders_target  INTEGER,
  UNIQUE (year, month, category)
);

CREATE INDEX IF NOT EXISTS idx_monthly_targets_year_month ON monthly_targets(year, month);
CREATE INDEX IF NOT EXISTS idx_monthly_targets_category ON monthly_targets(category);

-- Returns table
CREATE TABLE returns (
  id            SERIAL PRIMARY KEY,
  order_item_id INTEGER REFERENCES order_items(id),
  reason        VARCHAR(50) NOT NULL,
  refund_amount DECIMAL(10, 2) NOT NULL,
  created_at    TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_returns_created ON returns(created_at);
CREATE INDEX IF NOT EXISTS idx_returns_reason ON returns(reason);

-- Reviews table
CREATE TABLE reviews (
  id SERIAL PRIMARY KEY,
  product_id INTEGER REFERENCES products(id),
  customer_id INTEGER REFERENCES customers(id),
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
