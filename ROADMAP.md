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

---

## Phase 4 — Microservices Infrastructure (remaining)

### 4.8 — Document content extraction (backoffice-service)
- [ ] Detect file type from extension / MIME type on `POST /documents`
- [ ] PDF: extract text via `pdf-parse` before sending to knowledge-agent
- [ ] Images (JPEG/PNG/TIFF): OCR via AWS Textract or Tesseract
- [ ] Pass extracted text (or a `textS3Key`) in the `document.uploaded` event so knowledge-agent doesn't need to re-fetch for plain text
- [ ] For complex formats (PPTX, DOCX): LibreOffice headless conversion → PDF → extract

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
