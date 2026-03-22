-- ClickHouse analytical warehouse schema for BiAgent.
--
-- All tables are populated by the BiAgent Kafka consumer (created events only).
-- monthly_targets is seeded directly (no Kafka event).
--
-- Engine notes:
--   MergeTree         — immutable event-derived tables (orders, products, customers, reviews)
--   ReplacingMergeTree — tables that may be re-seeded / updated (monthly_targets)
--
-- Partition by month on all time-series tables so ClickHouse can skip entire
-- months of data during range queries.


-- ── customers ────────────────────────────────────────────────────────────────
-- Source: customer.registered
CREATE TABLE IF NOT EXISTS customers (
    id            UInt32,
    email         String,
    name          String,
    registered_at DateTime
) ENGINE = MergeTree()
ORDER BY id;


-- ── products ─────────────────────────────────────────────────────────────────
-- Source: product.created
CREATE TABLE IF NOT EXISTS products (
    id         UInt32,
    name       String,
    category   LowCardinality(String),
    price      Decimal(10, 2),
    created_at DateTime
) ENGINE = MergeTree()
ORDER BY id;


-- ── orders ───────────────────────────────────────────────────────────────────
-- Source: order.placed (header row — one per order)
CREATE TABLE IF NOT EXISTS orders (
    id           UInt32,
    customer_id  UInt32,
    total_amount Decimal(10, 2),
    placed_at    DateTime
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(placed_at)
ORDER BY (placed_at, id);


-- ── order_items ──────────────────────────────────────────────────────────────
-- Source: order.placed (items array flattened by consumer)
-- placed_at duplicated from the parent order for partition pruning without joins.
CREATE TABLE IF NOT EXISTS order_items (
    order_id   UInt32,
    product_id UInt32,
    quantity   UInt32,
    price      Decimal(10, 2),
    placed_at  DateTime
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(placed_at)
ORDER BY (placed_at, order_id, product_id);


-- ── reviews ──────────────────────────────────────────────────────────────────
-- Source: review.created
CREATE TABLE IF NOT EXISTS reviews (
    id          UInt32,
    product_id  UInt32,
    customer_id UInt32,
    rating      UInt8,
    comment     Nullable(String),
    created_at  DateTime
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(created_at)
ORDER BY (created_at, id);


-- ── monthly_targets ──────────────────────────────────────────────────────────
-- Seeded directly (no Kafka event). ReplacingMergeTree so re-seeding is safe.
CREATE TABLE IF NOT EXISTS monthly_targets (
    year           UInt16,
    month          UInt8,
    category       LowCardinality(String),
    revenue_target Decimal(10, 2),
    orders_target  Nullable(UInt32)
) ENGINE = ReplacingMergeTree()
ORDER BY (year, month, category);
