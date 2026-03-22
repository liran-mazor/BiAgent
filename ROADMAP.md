# BiAgent Roadmap

---

## Completed ✓

- Phase 1 — Monolith tools (native + MCP)
- Phase 2 — knowledge-agent RAG pipeline
- Phase 3 — Production readiness (gateway, auth, validation, shutdown, timeout, rate limiting)

---

## Phase 4 — Microservices Infrastructure

### 4.1 — Docker Compose foundation
- [ ] Add kafka kfraft
- [ ] Add ClickHouse (BiAgent read model)
- [ ] Keep existing PostgreSQL (OLTP for microservices)
- [ ] Verify all services start cleanly together

### 4.2 — orders-service
- [ ] Express server, schema `orders` on shared PostgreSQL
- [ ] `POST /orders` — place an order (immutable, no updates)
- [ ] `POST /orders/:id/return` — return an order
- [ ] Outbox table in same schema
- [ ] Outbox worker — polls outbox, publishes to kafka Streaming
- [ ] Events: `order.placed`, `order.returned`

### 4.3 — catalog-service
- [ ] Express server, schema `catalog` on shared PostgreSQL
- [ ] `POST /products` — create a product
- [ ] `POST /products/:id/price` — new price event (append-only, no UPDATE)
- [ ] Outbox table + worker
- [ ] Events: `product.created`, `price.changed`

### 4.4 — customers-service
- [ ] Express server, schema `customers` on shared PostgreSQL
- [ ] `POST /customers` — register a customer
- [ ] Outbox table + worker
- [ ] Events: `customer.registered`

### 4.5 — back-office service
- [ ] Express server, schema `backoffice` on shared PostgreSQL
- [ ] `POST /targets` — set monthly revenue target per category
- [ ] `POST /documents` — upload doc to S3, publish `document.uploaded` event with S3 key + URL
- [ ] Outbox table + worker
- [ ] Events: `target.set`, `document.uploaded`

### 4.6 — ClickHouse schema + BiAgent consumer
- [ ] ClickHouse tables: orders, products, customers, targets
- [ ] BiAgent kafka consumer — listens to all operational events
- [ ] Writes to ClickHouse read model on each event
- [ ] Consumer retry policy + dead letter queue for failed events
- [ ] Handle hot keys (high-volume categories like Electronics)

### 4.7 — MCP server wrapping ClickHouse
- [ ] New MCP server (or extend existing) — connects to ClickHouse
- [ ] Exposes `query_analytics` tool — SELECT against ClickHouse read model
- [ ] BiAgent discovers it at startup alongside existing PostgreSQL MCP
- [ ] Retire direct PostgreSQL queries for analytical use cases

### 4.8 — Document content extraction (backoffice-service)
- [ ] Detect file type from extension / MIME type on `POST /documents`
- [ ] PDF: extract text via `pdf-parse` before sending to knowledge-agent
- [ ] Images (JPEG/PNG/TIFF): OCR via AWS Textract or Tesseract
- [ ] Pass extracted text (or a `textS3Key`) in the `document.uploaded` event so knowledge-agent doesn't need to re-fetch for plain text
- [ ] For complex formats (PPTX, DOCX): LibreOffice headless conversion → PDF → extract

### 4.9 — knowledge-agent kafka consumer
- [ ] knowledge-agent subscribes to `document.uploaded` → download from S3 → ingest pipeline
- [ ] Replace manual `npm run ingest` CLI with event-driven ingestion
- [ ] `source` field in documents table stores S3 key, not filename

### 4.9 — Shared infrastructure
- [ ] commmon fodler 

### 4.10 — End-to-end smoke test
- [ ] Place an order → verify it appears in ClickHouse
- [ ] Upload a document via back-office → verify it's queryable via RAG
- [ ] Upload a document via back-office → verify it's queryable via RAG (kafka → knowledge-agent)
- [ ] BiAgent query combining ClickHouse actuals + RAG context

---

## Deferred

- Semantic cache (wait for real usage patterns)
- Structured logging / Datadog (wait for log aggregation setup)
- CDC via Debezium (add after outbox is solid)
- One DB per service (overkill for now — schema-per-service on shared Postgres)
- Full event sourcing
- Tests (vitest — add after architecture stabilizes)

---

## Future

- Persona-driven memory (user declares role on first message → drives summarization aggressiveness)
- MCP over REST API (back-office APIs become the MCP target, DB is internal detail)
- ClickHouse at scale with partitioning by date + category
