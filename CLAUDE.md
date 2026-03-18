# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Infrastructure (required before running the agent)
docker-compose up -d          # Start PostgreSQL
npm run init-db               # Initialize DB schema (runs in agentiq-mcp-server)
npm run seed                  # Seed sample data

# Run BiAgent (convenience scripts start observability-agent automatically)
npm start "query"             # Single query via CLI
npm run interactive           # Conversational CLI
npm run alfred                # Alfred voice (RPi) + ObservabilityAgent together
npm run telegram              # Telegram bot + ObservabilityAgent together
npm run dev                   # CLI + ObservabilityAgent together

# Run components individually
npm run voice                 # Alfred only (no companion agent)
npm run bot                   # Telegram bot only

# Companion services (if starting manually)
cd ../observability-agent && npm run dev  # A2A ObservabilityAgent (port 3003)
cd ../agentiq-mcp-server && npm run dev   # MCP server (STDIO-based)

# Maintenance
npm run daily-seed            # Seed new daily data
```

TypeScript is run directly with `tsx` — no build step needed.

## Architecture

BiAgent is a ReAct-pattern autonomous agent built from scratch (no LangChain/LangGraph). The agent loop lives in `src/agent/agent.ts`.

### Query Lifecycle (agent.ts `run()`)
1. `routeQuery()` → Haiku decides: model (Haiku/Sonnet), pattern (DIRECT/REACT), or returns `unavailableResponse` if required tools are down
2. If `unavailableResponse` → return immediately, zero further LLM calls
3. `formatToolsForClaude()` — called once per `run()`, reused across all iterations
4. `summarizeIfNeeded()` → token count check → compress history with structured summary if >170k tokens → selective injection based on current query
5. `markHistoryCacheBoundary()` → marks prompt cache slot 3
6. `createUserPrompt()` → injects current date + circuit breaker warnings
7. **DIRECT path** → `runDirect()`: one tool call + one final answer, flat context, no loop
8. **REACT path** → iterative loop: `callLLM()` → parallel `executeTool()` with circuit breaker → repeat until final answer

### Three-Tier Tool Resolution
- **Native** — in-process (chart, web_search, email, forecast_revenue)
- **MCP** — STDIO protocol via `agentiq-mcp-server/` (query_database → PostgreSQL)
- **A2A** — HTTP protocol via `observability-agent/` (query_observability, discovered dynamically from Agent Card)

MCP tools are initialized via `initializeMCPClients()` (with retry — 5 attempts, 2s delay to handle race conditions when services start concurrently). A2A tools are lazily initialized inside the agent on the first `run()` call using a cached promise. Reset-on-failure allows automatic retry.

### Tool Inventory
**Native (4):** `chart`, `email`, `web_search`, `forecast_revenue`
**MCP (1):** `query_database` — SQL against 5 tables (customers, products, orders, order_items, reviews)
**A2A (1):** `query_observability` — ObservabilityAgent fetches LangSmith traces, answers any observability question via Haiku, returns `{ answer }`

### Prompt Caching (3/4 slots used)
- Slot 1: System prompt (`cache_control: ephemeral` on system content block)
- Slot 2: Tool definitions (cache boundary on last tool in array)
- Slot 3: Conversation history (`markHistoryCacheBoundary()` marks last message before new push)
- Slot 4: Reserved for RAG

### Query Router
`routerService.ts` sends the query + open circuit breakers to Haiku via forced tool use (`route_query`). Returns:
- `model`: Haiku (simple) or Sonnet (complex)
- `pattern`: DIRECT (single pass) or REACT (iterative loop)
- `unavailableResponse`: set when required tools are down — returned immediately, no further LLM calls

### Context Management
Token count tracked per-conversation. Triggers structured summarization at 170k tokens (85% of 200k limit). Haiku compresses history via forced tool use into a `StructuredSummary` (topic, key_facts, resolved_entities, queries_run, open_questions). `formatSummaryForContext(summary, query)` selectively injects only relevant fields based on the current query. Lives in `summaryService.ts`.

### Circuit Breaker
`src/utils/circuitBreaker.ts` — opossum-based registry keyed by tool name. Applied only to MCP and A2A tools (native tools are in-process, no network). MCP config: 5s timeout; A2A config: 30s timeout (LangSmith fetch + LLM call). Both: 50% error threshold, 10s reset timeout.

The circuit breaker is **closed-loop**: a module-level `openCircuits: Set<string>` is updated on every `open`/`close` event. `getOpenCircuits()` is called once per `run()` and passed to both `routeQuery()` (for availability routing) and `createUserPrompt()` (for ReAct loop warnings).

### LangSmith Observability
Both Anthropic and OpenAI clients are wrapped with LangSmith (`wrapSDK`, `wrapOpenAI`) in `src/config/clients.ts`. Zero agent code changes needed — all LLM calls traced automatically.

### Key Files
| Path | Purpose |
|------|---------|
| `src/agent/agent.ts` | Query lifecycle + all private orchestration methods |
| `src/agent/prompts.ts` | All prompts: system, router, summary |
| `src/agent/models.ts` | `MODEL` constants (Haiku/Sonnet model IDs) |
| `src/config/clients.ts` | Shared Anthropic + OpenAI singletons, LangSmith-wrapped |
| `src/mcp/bootstrap.ts` | `initializeMCPClients()` |
| `src/a2a/observabilityClient.ts` | `initializeA2ATools()` + A2A discovery |
| `src/services/routerService.ts` | Haiku router → model + pattern + availability |
| `src/services/summaryService.ts` | Structured history summarization + selective injection |
| `src/utils/circuitBreaker.ts` | opossum circuit breaker registry (MCP/A2A only) |
| `src/tools/chartTool.ts` | Chart.js + S3 upload; exports `getLastChartUrl`/`clearLastChartUrl` |
| `src/tools/forecastTool.ts` | Native linear trend forecasting |
| `src/services/faceService.ts` | WebSocket server (port 3002) + `sendChart()` to RPi face |

### Companion Projects (sibling directories)
- `../agentiq-mcp-server/` — Standalone MCP server exposing `query_database` over STDIO
- `../observability-agent/` — Standalone A2A agent (port 3003); exposes `query_observability`; fetches LangSmith traces and answers any observability question via Haiku; Agent Card at `/.well-known/agent.json`

### Alfred Voice Interface
Wake-word-activated assistant deployed on Raspberry Pi 4 with 7" touchscreen.

**Flow:** Picovoice wake word ("Alfred") → stop recorder → play "All ears" → record 7s → play "On it" → Whisper STT → agent (with `[VOICE_INTERFACE]` prefix for short responses) → Google Cloud TTS → audio playback.

**Chart display:** After each query, `getLastChartUrl()` is checked. If a chart was generated, `faceService.sendChart(url)` pushes it via WebSocket to `face.html` as a fullscreen overlay — sent *before* `play()` so it appears as Alfred starts speaking. `clearLastChartUrl()` prevents stale charts across queries.

**Key details:**
- Wake word model: `src/voice/audio/alfred.ppn` (custom-trained Picovoice)
- Pre-generated audio: `confirmation.mp3` ("All ears"), `ack.mp3` ("On it")
- RPi timing: 950ms delays on mouth animations; 400ms after recorder stop before confirmation plays
- Cancel: saying "stop" after wake word → `continue` back to listening loop
- Voice: `en-GB-Neural2-B` (British male, Google Cloud TTS)

### Interfaces
- `src/interfaces/index.ts` — CLI single query
- `src/interfaces/interactive.ts` — conversational CLI with session memory
- `src/interfaces/telegramBot.ts` — Telegram bot (text + voice)
- `src/interfaces/alfred.ts` — Alfred wake word loop + chart display

### Pitch Presentation
`pitch/biagent-presentation.html` — standalone single-file reveal-style HTML. No build step; open directly in a browser.

**Navigation:** Enter / Space / ArrowRight advance steps within a slide. ArrowRight at end of slide moves to next slide. Click also advances.

**Aesthetic — "old money" dark mode:**
- Background: `#1c1812`, cream: `#e8dfc8`, parchment: `#c4b89a`, green: `#3d6456`, gold: `#b8a07a`, dim: `#4a4035`
- Grain texture overlay (SVG noise filter), corner bracket ornaments
- Title: Cormorant Garamond (thin, spaced, uppercase) / Body: Libre Baskerville / Mono: DM Mono

**Slide status:**
- Page 1 — complete and approved. Four sections revealed in sequence: S1 header, S2 divider + tagline, S3 example query, S4 flow diagram.

## Environment Variables Required
```
ANTHROPIC_API_KEY
OPENAI_API_KEY
TAVILY_API_KEY
TELEGRAM_BOT_TOKEN
AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_REGION / S3_BUCKET_NAME
LANGSMITH_TRACING=true
LANGSMITH_ENDPOINT=https://api.smith.langchain.com
LANGSMITH_API_KEY
LANGSMITH_PROJECT=BiAgent
OBSERVABILITY_AGENT_URL=http://localhost:3003
PICOVOICE_ACCESS_KEY     # Alfred only
GOOGLE_APPLICATION_CREDENTIALS  # Alfred TTS only
```
