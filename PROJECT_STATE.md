## Phase 1 — Making it not embarrassingly slow

Once it worked, the obvious problem was cost and latency. Every query hit Sonnet, even trivial ones. Repeated questions hit the full pipeline every time.

Added three things:
- **Semantic caching** with pgvector — embed the query, search for similar past queries, return cached answer if close enough. Smart TTL based on whether the data is real-time vs historical.
- **Prompt caching** — system prompt as a cacheable content block, so Claude doesn't re-process it on every call.
- **Parallel tool execution** — if Claude calls multiple tools at once, run them with `Promise.all` instead of sequentially.

These weren't planned upfront. The semantic cache came from noticing that demo queries repeated constantly. Prompt caching was just reading the Claude docs properly.

---

## Phase 2 — MCP: proper separation of concerns

The database tool was embedded directly in the agent. That felt wrong — the agent shouldn't own the DB connection, the schema knowledge, the query validation. Those belong to their own service.

The Model Context Protocol (MCP) was the right answer. Pulled the database tool out into a standalone MCP server (`mcp-server/`) that the agent connects to over STDIO. The agent became an MCP client, discovering tools dynamically at startup.

Side effect: the MCP server can be versioned, deployed, and tested independently.

---

## Phase 3 — Not every question needs Sonnet

Running all queries through Sonnet was wasteful. "What's 15% of 2400?" doesn't need Sonnet's reasoning depth.

Added a Haiku-powered router that classifies query complexity before the main agent runs. Simple queries stay on Haiku. Complex ones (multi-step reasoning, forecasting, multi-tool chains) go to Sonnet. The router returns the pattern directly — the agent dispatches to `runFunctionCall()` or `runReact()` via a `patternHandlers` map.

Result: ~70% cost reduction on typical workloads.

---

## Phase 4 — A2A: a second agent enters

Built `knowledge-agent` as a standalone A2A service — the one agent that genuinely earns its own process. The retrieval pipeline is complex enough to deserve its own context window: chunk → embed → rerank → synthesize. BiAgent sends a question over HTTP and gets back one clean answer with source citations.

**Pipeline:**
- `lib/chunker.ts` — recursive character splitting (2000 chars, 400 overlap), `[title | doc_type]:` prefix baked into chunk text
- `scripts/ingest.ts` — gpt-4o-mini metadata extraction (tool_choice + Zod), `text-embedding-3-small`, pgvector upsert. Idempotent.
- `lib/retriever.ts` — embeds query, cosine search with heuristic pre-filters (doc_type + year from question keywords)
- `lib/reranker.ts` — Cohere `rerank-v3.5` cross-encoder, top-20 candidates → top-5
- `lib/synthesizer.ts` — gpt-4o-mini synthesis with grounding prompt, chunks sorted back to document order before synthesis

**Knowledge base:** 9 documents covering 2025–2026 strategy, board decisions, year-end performance, pricing policy, EMEA expansion analysis, marketing, headcount, IT infrastructure.

---

## Phase 5 — Context engineering and resilience

Two problems surfaced with longer conversations:

**Context window:** Long sessions were hitting token limits. Added Haiku-powered summarization at 85% of the limit — compress the oldest half of history, keep a structured summary. No context is truly lost.

**Network failures:** MCP and A2A tools are network calls. Added circuit breakers (opossum) — per-tool, module-level registry. If a tool fails too often, the circuit opens and Claude gets a clean error to reason about.

Also promoted prompt caching to three slots: system prompt, tool definitions, and conversation history.

---

## Phase 6 — Observability and something physical

**Observability:** Wrapped both API clients (Anthropic and OpenAI) with LangSmith at the `clients.ts` level. Every LLM call is traced automatically — latency, tokens, cost, full payloads. Zero changes to agent logic.

**Alfred:** Deployed on a Raspberry Pi 4 with a 7" touchscreen as a wake-word-activated voice assistant. Custom-trained wake word ("Alfred"), Whisper for STT, Google Cloud TTS for the British voice, lip-synced mouth animation. When the agent generates a chart, it appears as a fullscreen overlay on the physical screen while Alfred speaks the answer.

---

## Phase 7 — Production readiness

A series of hardening changes:

**API Gateway** (`gateway/`) — Express gateway on port 3000. All A2A traffic routes through it instead of calling knowledge-agent directly. JWT authentication on every `/tasks` call (shared `JWT_SECRET`, 5-minute tokens generated per-call). Rate limiting: 60 req/min per IP. Route registry maps path prefix → upstream agent URL. Adding a new A2A agent = one line.

**Env validation** — both BiAgent and knowledge-agent validate all required env vars at startup and exit with a clear error listing missing keys. No more silent failures at first API call.

**Graceful shutdown** — `SIGTERM`/`SIGINT` handlers on knowledge-agent, gateway, and BiAgent interactive interface. HTTP server stops accepting connections, in-flight requests drain, MCP connections close, process exits cleanly. Force-exit after 10s if anything hangs.

**Request timeout** — RAG pipeline in knowledge-agent wrapped in `Promise.race` against a configurable timeout (default 30s). Returns `{ status: 'failed', error: 'timed out' }` immediately instead of holding the connection open.

**File structure cleanup** — deleted dead code (`voiceService.rpi.ts`), moved Alfred-specific type declarations to `src/alfred/`, gitignored runtime temp files, renamed service files to entity convention (`routerService.ts` → `router.ts`, `summaryService.ts` → `summarizer.ts`).

**knowledge-agent config** — `src/config.ts` is the single source of truth for all model names and DB config. No duplicated constants across files.

---

## Current state

**Name:** BiAgent
**Architecture:** Monolith orchestrator (native tools + MCP) + 1 A2A agent (knowledge-agent) + API gateway
**Tools:** `query_database` (MCP), `chart`, `forecast_revenue`, `email`, `web_search` (native), `query_knowledge` (A2A via gateway)
**Interfaces:** CLI, interactive CLI, Telegram bot, Alfred (RPi voice)
**Monorepo:** npm workspaces — `agents/knowledge-agent`, `mcp-server/`, `gateway/`

---

*Last updated: March 2026*
