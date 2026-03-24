# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Demo / interview setup (one-time per fresh environment)
npm run demo:infra            # docker compose up -d (pgvector + ClickHouse)
npm run demo:init             # Apply schemas — no Kafka required
npm run seed-warehouse        # Seed ClickHouse with 5 years of historical data (once — volumes persist across reboots)
npm run ingest                # Seed pgvector with 9 knowledge base docs from app/knowledge/docs/

# Run the demo stack (two terminals)
npm run demo                  # Terminal 1: knowledge-agent + analytics (silent)
npm start "query"             # Terminal 2: single query via CLI

# Full dev stack (requires Kafka running)
docker compose up -d          # All infra: pgvector + ClickHouse + Kafka
npm run init                  # Init Kafka topics + ClickHouse schema + pgvector schema
npm run interactive           # Conversational CLI
npm run dev                   # Conversational CLI (alias)
npm run voice                 # Alfred voice interface (RPi)
npm run bot                   # Telegram bot

# Use docker compose (v2, no hyphen) — docker-compose v1 is incompatible with newer Docker Engine
```

TypeScript is run directly with `tsx` — no build step needed.

## Architecture

BiAgent is a ReAct-pattern autonomous agent built from scratch (no LangChain/LangGraph). The agent loop lives in `biagent/core/agent.ts`.

### Query Lifecycle (agent.ts `run()`)
1. `routeQuery()` → Haiku decides: pattern (FUNCTION_CALL/REACT), or returns `{ available: false, response }` if required tools are down
2. If `!route.available` → return immediately, zero further LLM calls
3. `formatToolsForClaude()` — called once per `run()`, reused across all iterations
4. `summarizeIfNeeded()` → token count check → compress history with structured summary if >170k tokens → selective injection based on current query
5. `markHistoryCacheBoundary()` → marks prompt cache slot 3
6. `createUserPrompt()` → injects current date + circuit breaker warnings
7. **FUNCTION_CALL path** → `runFunctionCall()`: one tool call + one final answer (Haiku), flat context, no loop
8. **REACT path** → iterative loop: `callLLM()` → parallel `executeTool()` with circuit breaker → repeat until final answer (Sonnet)

### Two-Tier Tool Resolution
- **Native** — in-process (chart, email, web_search, forecast_revenue). No circuit breaker — fail fast, no network risk.
- **A2A** — HTTP direct to analytics (port 3002) or knowledge-agent (port 3001). Circuit breaker: 30s timeout.

### Tool Inventory
| Tool | Protocol | Notes |
|------|----------|-------|
| `query_analytics` | A2A | SQL SELECT via analytics agent → ClickHouse warehouse |
| `query_knowledge` | A2A | RAG pipeline via knowledge-agent — pgvector + Cohere rerank + gpt-4o-mini |
| `chart` | Native | Chart.js → PNG → S3 upload |
| `forecast_revenue` | Native | Linear trend forecasting |
| `email` | Native | SMTP via nodemailer |
| `web_search` | Native | Tavily search API |

### Prompt Caching (3/4 slots used)
- Slot 1: System prompt (`cache_control: ephemeral` on system content block)
- Slot 2: Tool definitions (cache boundary on last tool in array)
- Slot 3: Conversation history (`markHistoryCacheBoundary()` marks last message before new push)
- Slot 4: Reserved (semantic cache — Phase 3)

### Query Router
`biagent/services/router.ts` sends the query + open circuit breakers to Haiku via forced tool use (`route_query`). Returns a discriminated union (`RouteResult`):
- `{ available: true, pattern: 'FUNCTION_CALL' | 'REACT' }` — model derived from pattern (FUNCTION_CALL → Haiku, REACT → Sonnet)
- `{ available: false, response: string }` — returned immediately when required tools are down, zero further LLM calls

### Context Management
Token count tracked per-conversation. Triggers structured summarization at 170k tokens (85% of 200k limit). Haiku compresses history via forced tool use into a `StructuredSummary` (topic, key_facts, resolved_entities, queries_run, open_questions). `formatSummaryForContext(summary, query)` selectively injects only relevant fields based on the current query. Lives in `biagent/services/summarizer.ts`.

### Circuit Breaker
`biagent/utils/circuitBreaker.ts` — opossum-based registry keyed by tool name. Applied to A2A tools only (native tools are in-process). A2A: 30s timeout, 50% error threshold, 10s reset.

The circuit breaker is **closed-loop**: a module-level `openCircuits: Set<string>` is updated on every `open`/`close` event. `getOpenCircuits()` is called once per `run()` and passed to both `routeQuery()` (for availability routing) and `createUserPrompt()` (for ReAct loop warnings).

### Chart URL Propagation
After a `chart` native call, `executeTool()` captures `result.data.chartUrl` into `agent.lastChartUrl`. Interfaces call `agent.getLastChartUrl()` / `agent.clearLastChartUrl()` after each query to send the chart image (Telegram) or push it to the RPi face (Alfred).

### LangSmith Observability
Both Anthropic and OpenAI clients are wrapped with LangSmith (`wrapSDK`, `wrapOpenAI`) in `biagent/config/clients.ts`. Zero agent code changes needed — all LLM calls traced automatically.

### Key Files
| Path | Purpose |
|------|---------|
| `biagent/core/agent.ts` | Query lifecycle + all private orchestration methods |
| `biagent/core/prompts.ts` | All prompts: system, router, summary |
| `biagent/core/models.ts` | `MODEL` constants (Haiku/Sonnet model IDs) |
| `biagent/config/clients.ts` | Shared Anthropic + OpenAI singletons, LangSmith-wrapped |
| `biagent/tools/` | Native tools: chart, email, web_search, forecast_revenue |
| `biagent/a2a/a2aClient.ts` | `initializeA2ATools()` — signs JWT, fetches Agent Cards, registers tasks |
| `biagent/a2a/a2aServers.ts` | A2A agent registry — direct URLs (KNOWLEDGE_URL + ANALYTICS_URL) |
| `biagent/services/router.ts` | Haiku router → `RouteResult` (pattern + availability) |
| `biagent/services/summarizer.ts` | Structured history summarization + selective injection |
| `biagent/utils/circuitBreaker.ts` | opossum circuit breaker registry (A2A only) |
| `biagent/utils/validateEnv.ts` | Required env var validation — exits on startup if missing |
| `biagent/alfred/faceService.ts` | WebSocket server (port 3006) + `sendChart()` to RPi face |
| `app/analytics/src/index.ts` | Analytics A2A agent — port 3002, HTTP + Kafka consumers |
| `app/analytics/src/app.ts` | Analytics Agent Card + `/tasks` handler (query_analytics) |
| `app/knowledge/docs/` | RAG knowledge base — 9 markdown docs (ingest reads from here) |
| `app/infra/local/` | Local scripts: init-demo.ts, seed-warehouse, postgres/clickhouse schemas |
| `app/infra/k8s/` | All K8s manifests: cluster, config, db, kafka, ingress, jobs, services |
| `app/infra/k8s/ingress/` | Kong plugins (JWT + rate limiting) + Ingress routing rules |
| `app/analytics/src/lib/executor.ts` | Executes SELECT queries against ClickHouse |
| `app/analytics/src/lib/batchBuffer.ts` | Generic buffer — flushes to ClickHouse on count (100) or timer (5s) |
| `app/analytics/src/consumers/` | 4 KafkaListener subclasses writing to ClickHouse via BatchBuffer |
| `app/knowledge/src/index.ts` | A2A server — Agent Card + `/tasks` handler + graceful shutdown |
| `app/knowledge/src/consumers/index.ts` | Kafka consumer lifecycle — DocumentUploadedListener wiring |
| `app/knowledge/src/consumers/DocumentUploadedListener.ts` | `document.uploaded` → S3 download → ingest pipeline |
| `app/knowledge/src/lib/chunker.ts` | Pure chunking logic — recursive split + overlap |
| `app/knowledge/src/lib/retriever.ts` | Embed query → pgvector cosine search; filters passed in by caller (no inference) |
| `app/knowledge/src/lib/reranker.ts` | Cohere cross-encoder reranking |
| `app/knowledge/src/lib/synthesizer.ts` | gpt-4o-mini synthesis over reranked chunks |
| `app/knowledge/src/config.ts` | Model names + DB config — single source of truth |
| `app/knowledge/src/scripts/ingest.ts` | Offline ingestion — LLM metadata + embed + upsert |

### Alfred Voice Interface
Wake-word-activated assistant deployed on Raspberry Pi 4 with 7" touchscreen.

**Flow:** Picovoice wake word ("Alfred") → stop recorder → play "All ears" → record 7s → play "On it" → Whisper STT → agent (with `[VOICE_INTERFACE]` prefix for short responses) → Google Cloud TTS → audio playback.

**Chart display:** After each query, `agent.getLastChartUrl()` is checked. If a chart was generated, `faceService.sendChart(url)` pushes it via WebSocket to `face.html` as a fullscreen overlay — sent *before* `play()` so it appears as Alfred starts speaking. `agent.clearLastChartUrl()` prevents stale charts across queries.

**Key details:**
- Wake word model: `biagent/alfred/audio/alfred.ppn` (custom-trained Picovoice)
- Pre-generated audio: `confirmation.mp3` ("All ears"), `ack.mp3` ("On it")
- RPi timing: 950ms delays on mouth animations; 400ms after recorder stop before confirmation plays
- Cancel: saying "stop" after wake word → `continue` back to listening loop
- Voice: `en-GB-Neural2-B` (British male, Google Cloud TTS)

### Interfaces
- `biagent/interfaces/index.ts` — CLI single query
- `biagent/interfaces/interactive.ts` — conversational CLI with session memory + graceful shutdown
- `biagent/interfaces/telegramBot.ts` — Telegram bot (text + voice)
- `biagent/interfaces/alfred.ts` — Alfred wake word loop + chart display

### Project Description
BiAgent is a BI agent with a Haiku router (FUNCTION_CALL/REACT patterns) + two A2A agents: knowledge-agent (RAG pipeline — pgvector + Cohere rerank + gpt-4o-mini) and analytics (Kafka consumers → ClickHouse batch writes + SQL query endpoint). BiAgent holds no database credentials — all warehouse queries go through the analytics A2A agent. In production (K8s), Kong handles ingress, JWT auth, and rate limiting.

### Pitch Presentation
`pitch/biagent-presentation.html` — standalone 3-slide reveal-style HTML. No build step; open directly in a browser.

**Navigation:** Enter / Space / ArrowRight advance steps within a slide. Click also advances.

**Aesthetic — "old money" dark mode:**
- Background: `#1c1812`, cream: `#e8dfc8`, parchment: `#c4b89a`, green: `#3d6456`, gold: `#b8a07a`, dim: `#4a4035`
- Grain texture overlay (SVG noise filter), corner bracket ornaments
- Title: Cormorant Garamond (thin, spaced, uppercase) / Body: Libre Baskerville / Mono: DM Mono

**Slide status:**
- Slide 1 — title, tagline, compound example query, flow diagram
- Slide 2 — two-agent architecture: BiAgent internals + A2A → knowledge-agent
- Slide 3 — RAG pipeline: index time (left) vs query time (right)

## Environment Variables Required
```
ANTHROPIC_API_KEY
OPENAI_API_KEY
TAVILY_API_KEY
JWT_SECRET                   # Signed per A2A call (verified by Kong in K8s)
KNOWLEDGE_URL=http://localhost:3001   # Direct agent URL (local/demo)
ANALYTICS_URL=http://localhost:3002   # Direct agent URL (local/demo)
TELEGRAM_BOT_TOKEN
AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_REGION / S3_BUCKET_NAME
LANGSMITH_TRACING=true
LANGSMITH_ENDPOINT=https://api.smith.langchain.com
LANGSMITH_API_KEY
LANGSMITH_PROJECT=BiAgent
PICOVOICE_ACCESS_KEY         # Alfred only
GOOGLE_APPLICATION_CREDENTIALS  # Alfred TTS only
```
