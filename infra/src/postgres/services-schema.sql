-- Services shared Postgres schema.
-- All business microservices write to this database.
-- The outbox table is the bridge to Kafka — written atomically with the entity row.

-- ── customers ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customers (
  id            INTEGER PRIMARY KEY,
  email         VARCHAR(255) UNIQUE NOT NULL,
  name          VARCHAR(255) NOT NULL,
  registered_at TIMESTAMPTZ NOT NULL
);

-- ── products ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
  id         INTEGER PRIMARY KEY,
  name       VARCHAR(255) NOT NULL,
  category   VARCHAR(100) NOT NULL,
  price      DECIMAL(10, 2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

-- ── orders ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id           INTEGER PRIMARY KEY,
  customer_id  INTEGER NOT NULL REFERENCES customers(id),
  total_amount DECIMAL(10, 2) NOT NULL,
  placed_at    TIMESTAMPTZ NOT NULL
);

-- ── order_items ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_items (
  order_id   INTEGER NOT NULL REFERENCES orders(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  quantity   INTEGER NOT NULL,
  price      DECIMAL(10, 2) NOT NULL,
  PRIMARY KEY (order_id, product_id)
);

-- ── reviews ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reviews (
  id          INTEGER PRIMARY KEY,
  product_id  INTEGER NOT NULL REFERENCES products(id),
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  rating      INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment     TEXT,
  created_at  TIMESTAMPTZ NOT NULL
);

-- ── documents ────────────────────────────────────────────────────────────────
-- Backoffice metadata only — S3 is the source of truth for the file itself.
CREATE TABLE IF NOT EXISTS documents (
  id           UUID PRIMARY KEY,
  s3_key       TEXT NOT NULL,
  s3_url       TEXT NOT NULL,
  content_type VARCHAR(100) NOT NULL,
  uploaded_at  TIMESTAMPTZ NOT NULL
);

-- ── outbox ───────────────────────────────────────────────────────────────────
-- Written atomically with the entity row. The outbox worker polls this table,
-- publishes to Kafka, then marks published_at.
CREATE TABLE IF NOT EXISTS outbox (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic        VARCHAR(100) NOT NULL,
  payload      JSONB NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  published_at TIMESTAMPTZ
);

-- Partial index — only indexes unpublished rows, keeps it small and fast.
CREATE INDEX IF NOT EXISTS idx_outbox_unpublished ON outbox(created_at)
  WHERE published_at IS NULL;
