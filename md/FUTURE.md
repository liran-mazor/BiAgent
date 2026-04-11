# BiAgent Future Work

---

## Future Enhancements

- **Persona-driven memory** — user declares role on first message → drives summarization aggressiveness (aggressive summary for junior, minimal for senior)

- **ClickHouse partitioning notes** — already implemented (PARTITION BY toYYYYMM on orders, order_items, reviews)

- **Light RAG** (graph-based retrieval) — triggers at 500+ pages
  - Entity + relationship extraction per chunk (LLM-based, structured output)
  - pgvector embeddings for entities + relationships
  - Graph traversal on query time: vector search on entities → N-hop relationship traversal → retrieve original chunks
  - New tables: `entities`, `relationships`
  - Query-time latency trade-off: slower (graph walk) vs. higher recall (multi-hop reasoning across concepts)

- **Security: Agentic Flagged Document Review** (agent + human-in-loop deletion)
  - LLM flags suspicious documents at ingest time (free, already calling gpt-4o-mini for metadata)
  - Weekly security report emails flagged docs to security team
  - **Agentic workflow:**
    1. Agent lists flagged docs with full context (chunk preview, type, year, exact flag reason)
    2. Human reviews + approves each one interactively
    3. Agent executes: `DELETE FROM rag_documents WHERE source = $1` + S3 deletion atomically
    4. Audit logged: approved_by, approved_reason, deleted_at
    5. Agent confirms: "Deleted 3 chunks from pgvector + S3. Audit logged."
  - **New tool: `delete_flagged_chunks(sources: string[], reason: string)`**
    - A2A call to knowledge-agent
    - Deletes from pgvector + S3 atomically
    - Logs to audit table (approved_by, approved_reason, deleted_at)
  - **Shows:**
    - Human judgment (agent can't delete unilaterally)
    - Full context (agent surfaces why it was flagged)
    - Audit trail (approval reasoning logged)
    - Reversible review (agent shows all flagged docs, human picks which to delete)
