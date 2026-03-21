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

The Model Context Protocol (MCP) was the right answer. Pulled the database tool out into a standalone MCP server (`agentiq-mcp-server`) that the agent connects to over STDIO. The agent became an MCP client, discovering tools dynamically at startup.

Side effect: the MCP server can be versioned, deployed, and tested independently.

---

## Phase 3 — Not every question needs Sonnet

Running all queries through Sonnet was wasteful. "What's 15% of 2400?" doesn't need Sonnet's reasoning depth.

Added a Haiku-powered router that classifies query complexity before the main agent runs. Simple queries stay on Haiku. Complex ones (multi-step reasoning, forecasting, multi-tool chains) go to Sonnet. The router returns the model string directly — the agent just uses it.

Result: ~70% cost reduction on typical workloads. Haiku pays for itself many times over just on the routing queries alone.

---

## Phase 4 — A2A: a second agent enters

Wanted to demonstrate multi-agent architecture, not just talk about it. The A2A (Agent-to-Agent) protocol was a natural fit: a standalone agent with an Agent Card, discovered dynamically at startup, callable over HTTP.

Built `forecast-agent` (later renamed `anomaly-detector-agent`) as a sibling service. BiAgent discovers its capabilities at startup from `/.well-known/agent.json` and registers them as tools — zero hardcoding. The tool just appears in the agent's tool list.

The tool resolution is now three-tier: Native (in-process) → MCP (STDIO) → A2A (HTTP). Each tier has different latency and failure characteristics.

---

## Phase 5 — Context engineering and resilience

Two problems surfaced with longer conversations:

**Context window:** Long sessions were hitting token limits. The naive fix (sliding window, drop old messages) loses context. Instead, count tokens via the API and trigger Haiku-powered summarization at 85% of the limit — compress the oldest half of history, keep a summary. No context is truly lost.

**Network failures:** MCP and A2A tools are network calls. They can timeout or fail. Added circuit breakers (opossum) — per-tool, module-level registry. If a tool fails too often, the circuit opens, requests fail fast, and Claude gets a clean error to reason about rather than a hanging call.

Also promoted prompt caching to three slots: system prompt, tool definitions, and conversation history. From the second iteration of any conversation, only the new message is processed at full cost.

---

## Phase 6 — Observability and something physical

**Observability:** Wrapped both API clients (Anthropic and OpenAI) with LangSmith at the `clients.ts` level. Every LLM call is traced automatically — latency, tokens, cost, full payloads. Zero changes to agent logic.

The anomaly detection that was previously a cron job inside BiAgent got properly extracted into a standalone A2A agent (`anomaly-detector-agent`). It fetches LangSmith traces, runs Haiku analysis, and returns a plain-text report. BiAgent can call it as a tool — "are there any anomalies?" becomes a first-class question the agent can answer.

**Alfred:** Wanted something tangible to show, not just a CLI. Deployed the agent on a Raspberry Pi 4 with a 7" touchscreen as a wake-word-activated voice assistant. Custom-trained wake word ("Alfred"), Whisper for STT, Google Cloud TTS for the British voice, lip-synced mouth animation on the screen. When the agent generates a chart, it appears as a fullscreen overlay on the physical screen while Alfred speaks the answer.

---

## After Phase 6 — architectural refinements

A handful of improvements that didn't warrant their own phases but changed how things fit together:

**A2A initialization moved into the agent.** Previously, every interface (`index.ts`, `interactive.ts`, `telegramBot.ts`, `alfred.ts`) had to call `initializeA2ATools()` before creating the agent and pass the result in via constructor. That coupling was wrong — the agent should own its own dependencies. A2A tools are now lazily discovered on the first `run()` call using a cached promise inside the agent. Interfaces just create the agent and call `run()`. Reset-on-failure means a transient network error doesn't permanently break discovery.

**Startup retry logic for MCP.** When starting Alfred or the Telegram bot, the MCP server and agent start roughly in parallel. The original code would fail immediately if the MCP server wasn't ready. Added a retry loop (5 attempts, 2s apart) to `connectWithRetry()` — the agent waits gracefully instead of crashing.

**Per-session token tracking.** The original implementation used a single `totalTokensUsed` counter across all sessions. Replaced with a `Map<sessionId, tokens>` so token counts and summarization thresholds are per-conversation. Relevant when multiple sessions are running simultaneously (e.g. Telegram bot with multiple users).

**Convenience scripts.** Running Alfred or Telegram now starts the AnomalyDetectorAgent automatically (`npm run alfred`, `npm run telegram`) via `concurrently`. No need to manually start companion services in a separate terminal.

---

## Phase 7 — Full multi-agent architecture

The three-tier tool resolution (native → MCP → A2A) was a design smell. Native tools lived in the same process as the orchestrator, which meant the orchestrator's context window carried all their dependencies — chart libraries, email clients, forecast logic. The right model is: the orchestrator routes, agents execute.

Moved everything to A2A. Each former tool became a standalone agent under `agents/`:
- `sql-agent` (port 3001) — wraps the MCP server internally, exposes `query_database` over HTTP
- `observability-agent` (port 3002) — moved from the sibling directory into the monorepo
- `analytics-agent` (port 3003) — `chart` + `forecast_revenue`
- `comms-agent` (port 3004) — `email`
- `research-agent` (port 3005) — `web_search`

The orchestrator now has zero tools of its own. It discovers all capabilities at startup from Agent Cards and delegates everything over HTTP. The `src/` directory shrunk significantly — no tool code, no MCP client, no native implementations.

Structured the repo as an npm workspace (`agents/`, `mcp-server/`) so `npm install` from root installs everything and scripts can target individual workspaces.

**Execution patterns hardened.** The router previously returned three things: model, pattern, and an optional unavailable response — a loose interface that mixed concerns. Replaced with a discriminated union (`RouteResult`): either `{ available: true, pattern }` or `{ available: false, response }`. Model selection moved out of the router entirely — it's not a routing decision, it's a property of the pattern. Each handler knows its own model (`FUNCTION_CALL` → Haiku, `REACT` → Sonnet). The router's schema dropped from two fields to one.

Pattern dispatch uses a `patternHandlers` map instead of if/else — adding a third pattern is a one-line change.

**A2A response envelope.** Standardized the agent response format to `{ status: 'completed', data: {...} }` or `{ status: 'failed', error: '...' }`. The orchestrator unwraps the envelope in `executeTool()` before passing results to Claude — the LLM sees clean domain data, not transport wrappers.

---

## Phase 7 — knowledge-agent: RAG pipeline

The missing capability was context. SQL tells you what happened. It can't tell you whether a revenue drop was planned, what the board decided, or whether a discount is policy-compliant. That context lives in documents.

Built `knowledge-agent` as a standalone A2A agent — the one agent that genuinely earns its own process. The retrieval pipeline is complex enough to deserve its own context window: chunk → embed → vector search → rerank → synthesize. BiAgent sends a question over HTTP and gets back one clean answer with source citations. It never sees raw chunks.

**Pipeline:**
- `lib/chunker.ts` — recursive character splitting (2000 chars, 400 overlap), `[title | doc_type]:` prefix baked into chunk text
- `scripts/ingest.ts` — LLM metadata extraction (gpt-4o-mini + tool_choice + Zod), `text-embedding-3-small`, pgvector upsert. Idempotent. Scans `docs/` automatically — no hardcoded registry.
- `lib/retriever.ts` — embeds query, cosine search with heuristic pre-filters (doc_type + year from question keywords)
- `lib/reranker.ts` — Cohere `rerank-v3.5` cross-encoder, 10 candidates → top-5
- `lib/synthesizer.ts` — Haiku synthesis with grounding prompt, chunks sorted back to document order before synthesis

**Key design decisions:**
- Index time: LLM extracts metadata (slow is fine — offline). Query time: heuristics filter (fast — on the hot path).
- Chunking is classic recursive, not document-aware. Simpler, deterministic, no dependency on document structure.
- Chunk text carries `[title | doc_type]:` prefix — the embedding encodes document context, not just content.

**Knowledge base:** 6 internal documents covering 2025–2026 strategy, board decisions, year-end performance, pricing policy, EMEA expansion analysis.

---

## Current state

**Name:** BiAgent
**Architecture:** Monolith orchestrator (native tools + MCP) + 1 A2A agent (knowledge-agent)
**Tools:** `query_database` (MCP), `chart`, `forecast_revenue`, `email`, `web_search` (native), `query_knowledge` (A2A)
**Interfaces:** CLI, interactive CLI, Telegram bot, Alfred (RPi voice)
**Monorepo:** npm workspaces — `agents/knowledge-agent`, `mcp-server/`

---

*Last updated: March 2026*
