# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Infrastructure (required before running the agent)
docker-compose up -d          # Start PostgreSQL
npm run init-db               # Initialize DB schema (runs in agentiq-mcp-server)
npm run seed                  # Seed sample data

# Run BiAgent (convenience scripts start anomaly-detector-agent automatically)
npm start "query"             # Single query via CLI
npm run interactive           # Conversational CLI
npm run alfred                # Alfred voice (RPi) + AnomalyDetectorAgent together
npm run telegram              # Telegram bot + AnomalyDetectorAgent together
npm run dev                   # CLI + AnomalyDetectorAgent together

# Run components individually
npm run voice                 # Alfred only (no companion agent)
npm run bot                   # Telegram bot only

# Companion services (if starting manually)
cd ../anomaly-detector-agent && npm run dev  # A2A AnomalyDetectorAgent (port 3003)
cd ../agentiq-mcp-server && npm run dev      # MCP server (STDIO-based)

# Maintenance
npm run clear-cache           # Clear semantic cache
npm run daily-seed            # Seed new daily data
```

TypeScript is run directly with `tsx` — no build step needed.

## Architecture

BiAgent is a ReAct-pattern autonomous agent built from scratch (no LangChain/LangGraph). The agent loop lives in `src/agent/agent.ts`.

### ReAct Loop (agent.ts `run()`)
1. Semantic cache check (pgvector cosine similarity, threshold 0.15)
2. `routeQuery()` → Haiku decides: use Haiku (simple) or Sonnet (complex)
3. `formatToolsForClaude()` — called once per `run()`, reused across all iterations
4. `manageContext()` — token count via API → summarize with Haiku if >170k tokens → mark prompt cache boundary
5. `callLLM()` — Claude API with cached system prompt + tool definitions + history
6. If tool calls → `executeTool()` in parallel (`Promise.all`) → circuit breaker for MCP/A2A tools
7. `checkToolFailures()` → continue or bail
8. `handleFinalResponse()` → store in session Map → cache result → return

### Three-Tier Tool Resolution
- **Native** — in-process (chart, web_search, email, forecast_revenue)
- **MCP** — STDIO protocol via `agentiq-mcp-server/` (query_database → PostgreSQL)
- **A2A** — HTTP protocol via `anomaly-detector-agent/` (detect_anomalies, discovered dynamically from Agent Card)

MCP tools are initialized via `initializeMCPClients()` (with retry — 5 attempts, 2s delay to handle race conditions when services start concurrently). A2A tools are lazily initialized inside the agent on the first `run()` call using a cached promise — interfaces no longer manage the A2A lifecycle. Reset-on-failure allows automatic retry.

### Tool Inventory
**Native (4):** `chart`, `email`, `web_search`, `forecast_revenue`
**MCP (1):** `query_database` — SQL against 5 tables (customers, products, orders, order_items, reviews)
**A2A (1):** `detect_anomalies` — AnomalyDetectorAgent fetches LangSmith traces, runs Haiku analysis, returns `{ report, hasIssues }`

### Prompt Caching (3/4 slots used)
- Slot 1: System prompt (`cache_control: ephemeral` on system content block)
- Slot 2: Tool definitions (cache boundary on last tool in array)
- Slot 3: Conversation history (`markHistoryCacheBoundary()` marks last message before new push)
- Slot 4: Reserved for RAG

### Semantic Cache
OpenAI embeddings → pgvector cosine similarity search. Cache hit if distance < 0.15. Smart TTL: 5min (real-time), 1hr (recent), 7 days (historical), 24hr (default). Lives in `src/services/cacheService.ts`.

### Intelligent Model Routing
`routerService.ts` sends the query to Haiku with a prompt describing all tools and complexity signals. Returns `CLAUDE.Haiku` or `CLAUDE.Sonnet` directly. ~70% cost reduction on typical workloads.

### Context Management
Token count via API in `manageContext()`. Triggers summarization at 170k tokens (85% of 200k context limit). Compresses the old half of history using Haiku — no context truly lost. Lives in `summaryService.ts`. Token usage is tracked per-session (`tokenUsageBySession: Map<string, number>`) and reset when summarization triggers.

### Circuit Breaker
`src/utils/circuitBreaker.ts` — opossum-based registry keyed by tool name. Applied only to MCP and A2A tools (native tools are in-process, no network). Config: 5s timeout, 50% error threshold, 10s reset timeout.

The circuit breaker is **closed-loop**: a module-level `openCircuits: Set<string>` is updated on every `open`/`close` event. `getOpenCircuits()` is called on every `run()` and the result is passed to `createUserPrompt()`. If any circuits are open, a warning is injected directly into the user message Claude receives:
```
⚠️ Service availability notice:
- The following tools have open circuit breakers and are temporarily unavailable: [tool names]. Do not call them — use available alternatives or inform the user.
```
Claude reasons around the failure rather than calling a broken tool and getting a fallback error.

### LangSmith Observability
Both Anthropic and OpenAI clients are wrapped with LangSmith (`wrapSDK`, `wrapOpenAI`) in `src/config/clients.ts`. Zero agent code changes needed — all LLM calls traced automatically.

### Key Files
| Path | Purpose |
|------|---------|
| `src/agent/agent.ts` | ReAct loop + all private orchestration methods |
| `src/agent/prompts.ts` | All prompts: system, router, summary |
| `src/agent/models.ts` | `CLAUDE` constants (Haiku/Sonnet model IDs) |
| `src/config/clients.ts` | Shared Anthropic + OpenAI singletons, LangSmith-wrapped |
| `src/mcp/bootstrap.ts` | `initializeMCPClients()` |
| `src/a2a/anomalyClient.ts` | `initializeA2ATools()` + A2A discovery |
| `src/services/cacheService.ts` | Semantic cache + pgvector |
| `src/services/routerService.ts` | Haiku router → returns model string |
| `src/services/summaryService.ts` | Token-aware history summarization |
| `src/utils/circuitBreaker.ts` | opossum circuit breaker registry (MCP/A2A only) |
| `src/tools/chartTool.ts` | Chart.js + S3 upload; exports `getLastChartUrl`/`clearLastChartUrl` |
| `src/tools/forecastTool.ts` | Native linear trend forecasting |
| `src/services/faceService.ts` | WebSocket server (port 3002) + `sendChart()` to RPi face |

### Companion Projects (sibling directories)
- `../agentiq-mcp-server/` — Standalone MCP server exposing `query_database` over STDIO
- `../anomaly-detector-agent/` — Standalone A2A agent (port 3003); exposes `detect_anomalies`; fetches LangSmith traces and runs Haiku anomaly analysis; Agent Card at `/.well-known/agent.json`

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
ANOMALY_AGENT_URL=http://localhost:3003
PICOVOICE_ACCESS_KEY     # Alfred only
GOOGLE_APPLICATION_CREDENTIALS  # Alfred TTS only
```
