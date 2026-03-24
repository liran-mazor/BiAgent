# BiAgent Roadmap

---

## Completed ✓

- Phase 1 — Monolith tools (native + MCP)
- Phase 2 — knowledge-agent RAG pipeline
- Phase 3 — Production readiness (gateway, auth, validation, shutdown, timeout, rate limiting)
- Phase 4.1 — Docker Compose foundation (Kafka KRaft, ClickHouse, PostgreSQL)
- Phase 4.2 — orders-service (place order, return order, outbox, `order.placed`)
- Phase 4.3 — catalog-service (products, price events, outbox, `product.created`)
- Phase 4.4 — customers-service (register customer, outbox, `customer.registered`)
- Phase 4.5 — backoffice-service (targets, S3 document upload, outbox, `document.uploaded`, `target.set`)
- Phase 4.6 — ClickHouse schema + BiAgent Kafka consumer (4 topics → ClickHouse read model, retry + DLQ)
- Phase 4.7 — `query_analytics` native tool (BiAgent queries ClickHouse directly)
- Phase 4.9 — knowledge-agent Kafka consumer (`document.uploaded` → S3 download → ingest pipeline; `source` = S3 key)
- Phase 4.10 — End-to-end smoke test (9/9 checks passed: orders, products, customers → ClickHouse; documents → pgvector; compound RAG query)
- Repo restructure — services under `services/`, knowledge-agent at root (peer of biagent), agents/ removed
- Demo mode — `docker-compose.demo.yml` (pgvector + ClickHouse only), `npm run demo` (gateway silent + knowledge-agent), Kafka consumer skips gracefully when Kafka unavailable
- ClickHouse warehouse seeded with 5 years of historical ecommerce data (8,942 orders, 17,863 items, 2,647 reviews)
- System prompt cleanup — no markdown rule reinforced, stale tool references removed, follow-up offers banned, router logs its decision
- S3 env var standardised to `S3_BUCKET_NAME` everywhere (was `AWS_S3_BUCKET` in s3Service)
- Platform restructure — common/, gateway/, infra/, services/ moved under app/ (flat: app/orders, app/catalog, etc.); biagent/biagent/ renamed to biagent/core/; charts/ moved to biagent/charts/
- analytics service — app/analytics/: Kafka consumers with BatchBuffer<T> (batch ClickHouse writes, flush on 100 rows or 5s) + A2A query endpoint; replaces native queryAnalyticsTool
- BiAgent decoupled from platform — no ClickHouse client, no Kafka consumers; queries ClickHouse via analytics A2A agent through gateway
- knowledge-agent consumer migrated to KafkaListener base class (DocumentUploadedListener), gains retry + DLQ
- validateEnv inlined into index.ts across all servers, separate validateEnv.ts files removed

---

## Phase 4 — Microservices Infrastructure (remaining)

### 4.8 — Document content extraction (backoffice-service)
- [ ] Detect file type from extension / MIME type on `POST /documents`
- [ ] PDF: extract text via `pdf-parse` before sending to knowledge-agent
- [ ] Images (JPEG/PNG/TIFF): OCR via AWS Textract or Tesseract
- [ ] Pass extracted text (or a `textS3Key`) in the `document.uploaded` event so knowledge-agent doesn't need to re-fetch for plain text
- [ ] For complex formats (PPTX, DOCX): LibreOffice headless conversion → PDF → extract

---

## Deferred

- Semantic cache (wait for real usage patterns)
- Structured logging / Datadog (wait for log aggregation setup)
- One DB per service (overkill for now — schema-per-service on shared Postgres)
- Full event sourcing
- Tests (vitest — add after architecture stabilizes)

---

## Future

- Persona-driven memory (user declares role on first message → drives summarization aggressiveness)
- ClickHouse partitioning — already implemented (PARTITION BY toYYYYMM on orders, order_items, reviews)
