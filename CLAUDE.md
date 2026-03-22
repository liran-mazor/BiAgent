# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Demo / interview setup (one-time per fresh environment)
npm run demo:infra            # docker compose -f docker-compose.demo.yml up -d (pgvector + ClickHouse)
npm run demo:init             # Apply schemas — no Kafka required
npm run seed-warehouse        # Seed ClickHouse with 5 years of historical data
npm run ingest                # Seed pgvector with 9 knowledge base docs from docs/

# Run the demo stack (two terminals)
npm run demo                  # Terminal 1: gateway (silent) + knowledge-agent
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

BiAgent is a ReAct-pattern autonomous agent built from scratch (no LangChain/LangGraph). The agent loop lives in `src/biagent/agent.ts`.

### Query Lifecycle (agent.ts `run()`)
1. `routeQuery()` → Haiku decides: pattern (FUNCTION_CALL/REACT), or returns `{ available: false, response }` if required tools are down
2. If `!route.available` → return immediately, zero further LLM calls
3. `formatToolsForClaude()` — called once per `run()`, reused across all iterations
4. `summarizeIfNeeded()` → token count check → compress history with structured summary if >170k tokens → selective injection based on current query
5. `markHistoryCacheBoundary()` → marks prompt cache slot 3
6. `createUserPrompt()` → injects current date + circuit breaker warnings
7. **FUNCTION_CALL path** → `runFunctionCall()`: one tool call + one final answer (Haiku), flat context, no loop
8. **REACT path** → iterative loop: `callLLM()` → parallel `executeTool()` with circuit breaker → repeat until final answer (Sonnet)

### Three-Tier Tool Resolution
- **Native** — in-process (chart, email, web_search, forecast_revenue). No circuit breaker — fail fast, no network risk.
- **MCP** — STDIO via `mcp-server/` (query_database → PostgreSQL). Circuit breaker: 5s timeout.
- **A2A** — HTTP via gateway (port 3000) → knowledge-agent (port 3001). Circuit breaker: 30s timeout.

### Tool Inventory
| Tool | Protocol | Notes |
|------|----------|-------|
| `query_analytics` | Native | SQL SELECT against ClickHouse warehouse |
| `chart` | Native | Chart.js → PNG → S3 upload |
| `forecast_revenue` | Native | Linear trend forecasting |
| `email` | Native | SMTP via nodemailer |
| `web_search` | Native | Tavily search API |
| `query_knowledge` | A2A | RAG pipeline — pgvector + Cohere rerank + gpt-4o-mini synthesis |

### Gateway
`gateway/src/index.ts` — Express API gateway on port 3000. All A2A traffic routes through it.
- JWT authentication on `POST /:agent/tasks` (shared `JWT_SECRET`)
- Rate limiting: 60 req/min per IP (configurable via env)
- Route registry: `UPSTREAM_AGENTS` maps path prefix → upstream URL
- Agent Card (`GET /:agent/.well-known/agent.json`) — public, no auth
- Adding a new A2A agent = one line in `UPSTREAM_AGENTS`

### Prompt Caching (3/4 slots used)
- Slot 1: System prompt (`cache_control: ephemeral` on system content block)
- Slot 2: Tool definitions (cache boundary on last tool in array)
- Slot 3: Conversation history (`markHistoryCacheBoundary()` marks last message before new push)
- Slot 4: Reserved (semantic cache — Phase 3)

### Query Router
`src/services/router.ts` sends the query + open circuit breakers to Haiku via forced tool use (`route_query`). Returns a discriminated union (`RouteResult`):
- `{ available: true, pattern: 'FUNCTION_CALL' | 'REACT' }` — model derived from pattern (FUNCTION_CALL → Haiku, REACT → Sonnet)
- `{ available: false, response: string }` — returned immediately when required tools are down, zero further LLM calls

### Context Management
Token count tracked per-conversation. Triggers structured summarization at 170k tokens (85% of 200k limit). Haiku compresses history via forced tool use into a `StructuredSummary` (topic, key_facts, resolved_entities, queries_run, open_questions). `formatSummaryForContext(summary, query)` selectively injects only relevant fields based on the current query. Lives in `src/services/summarizer.ts`.

### Circuit Breaker
`src/utils/circuitBreaker.ts` — opossum-based registry keyed by tool name. Applied to MCP and A2A tools only (native tools are in-process). MCP: 5s timeout. A2A: 30s timeout. Both: 50% error threshold, 10s reset.

The circuit breaker is **closed-loop**: a module-level `openCircuits: Set<string>` is updated on every `open`/`close` event. `getOpenCircuits()` is called once per `run()` and passed to both `routeQuery()` (for availability routing) and `createUserPrompt()` (for ReAct loop warnings).

### Chart URL Propagation
After a `chart` native call, `executeTool()` captures `result.data.chartUrl` into `agent.lastChartUrl`. Interfaces call `agent.getLastChartUrl()` / `agent.clearLastChartUrl()` after each query to send the chart image (Telegram) or push it to the RPi face (Alfred).

### LangSmith Observability
Both Anthropic and OpenAI clients are wrapped with LangSmith (`wrapSDK`, `wrapOpenAI`) in `src/config/clients.ts`. Zero agent code changes needed — all LLM calls traced automatically.

### Key Files
| Path | Purpose |
|------|---------|
| `src/biagent/agent.ts` | Query lifecycle + all private orchestration methods |
| `src/biagent/prompts.ts` | All prompts: system, router, summary |
| `src/biagent/models.ts` | `MODEL` constants (Haiku/Sonnet model IDs) |
| `src/config/clients.ts` | Shared Anthropic + OpenAI singletons, LangSmith-wrapped |
| `src/tools/` | Native tools: chart, email, web_search, forecast_revenue |
| `src/mcp/` | MCP client, bootstrap, server config |
| `src/a2a/a2aClient.ts` | `initializeA2ATools()` — signs JWT, fetches Agent Cards, registers tasks |
| `src/a2a/a2aServers.ts` | A2A agent registry — points to gateway |
| `src/services/router.ts` | Haiku router → `RouteResult` (pattern + availability) |
| `src/services/summarizer.ts` | Structured history summarization + selective injection |
| `src/utils/circuitBreaker.ts` | opossum circuit breaker registry (MCP + A2A only) |
| `src/utils/validateEnv.ts` | Required env var validation — exits on startup if missing |
| `src/alfred/faceService.ts` | WebSocket server (port 3006) + `sendChart()` to RPi face |
| `gateway/src/index.ts` | API gateway — JWT auth + rate limiting + proxy |
| `biagent/tools/queryAnalyticsTool.ts` | Native ClickHouse tool — SELECT only, uses shared clickhouse client |
| `knowledge-agent/src/index.ts` | A2A server — Agent Card + `/tasks` handler + graceful shutdown |
| `knowledge-agent/src/consumer.ts` | Kafka consumer — `document.uploaded` → S3 download → ingest pipeline |
| `knowledge-agent/src/lib/chunker.ts` | Pure chunking logic — recursive split + overlap |
| `knowledge-agent/src/lib/retriever.ts` | Embed query → pgvector cosine search + pre-filters |
| `knowledge-agent/src/lib/reranker.ts` | Cohere cross-encoder reranking |
| `knowledge-agent/src/lib/synthesizer.ts` | gpt-4o-mini synthesis over reranked chunks |
| `knowledge-agent/src/config.ts` | Model names + DB config — single source of truth |
| `knowledge-agent/src/scripts/ingest.ts` | Offline ingestion — LLM metadata + embed + upsert |

### Alfred Voice Interface
Wake-word-activated assistant deployed on Raspberry Pi 4 with 7" touchscreen.

**Flow:** Picovoice wake word ("Alfred") → stop recorder → play "All ears" → record 7s → play "On it" → Whisper STT → agent (with `[VOICE_INTERFACE]` prefix for short responses) → Google Cloud TTS → audio playback.

**Chart display:** After each query, `agent.getLastChartUrl()` is checked. If a chart was generated, `faceService.sendChart(url)` pushes it via WebSocket to `face.html` as a fullscreen overlay — sent *before* `play()` so it appears as Alfred starts speaking. `agent.clearLastChartUrl()` prevents stale charts across queries.

**Key details:**
- Wake word model: `src/alfred/audio/alfred.ppn` (custom-trained Picovoice)
- Pre-generated audio: `confirmation.mp3` ("All ears"), `ack.mp3` ("On it")
- RPi timing: 950ms delays on mouth animations; 400ms after recorder stop before confirmation plays
- Cancel: saying "stop" after wake word → `continue` back to listening loop
- Voice: `en-GB-Neural2-B` (British male, Google Cloud TTS)

### Interfaces
- `src/interfaces/index.ts` — CLI single query
- `src/interfaces/interactive.ts` — conversational CLI with session memory + graceful shutdown
- `src/interfaces/telegramBot.ts` — Telegram bot (text + voice)
- `src/interfaces/alfred.ts` — Alfred wake word loop + chart display

### Project Description
BiAgent is a BI agent with a Haiku router (FUNCTION_CALL/REACT patterns) + a knowledge-agent A2A service that answers questions from internal documents via a full RAG pipeline (pgvector + Cohere rerank + gpt-4o-mini synthesis). All A2A traffic routes through an Express gateway with JWT auth and rate limiting. Two agents, one gateway, one HTTP bridge.

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
COHERE_API_KEY
JWT_SECRET                   # Shared secret for gateway JWT auth
GATEWAY_URL=http://localhost:3000
KNOWLEDGE_AGENT_URL=http://localhost:3001
TELEGRAM_BOT_TOKEN
AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_REGION / S3_BUCKET_NAME
LANGSMITH_TRACING=true
LANGSMITH_ENDPOINT=https://api.smith.langchain.com
LANGSMITH_API_KEY
LANGSMITH_PROJECT=BiAgent
PICOVOICE_ACCESS_KEY         # Alfred only
GOOGLE_APPLICATION_CREDENTIALS  # Alfred TTS only
RAG_TIMEOUT_MS=30000         # Optional — default 30s
RATE_LIMIT_WINDOW_MS=60000   # Optional — default 1 minute
RATE_LIMIT_MAX_REQUESTS=60   # Optional — default 60 req/min
```
