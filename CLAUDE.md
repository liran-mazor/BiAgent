# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Infrastructure (required before running the agent)
docker-compose up -d          # Start PostgreSQL
npm run init-db               # Initialize DB schema (runs in agentiq-mcp-server)
npm run seed                  # Seed sample data

# Run BiAgent
npm start "query"             # Single query via CLI
npm run interactive           # Conversational CLI
npm run bot                   # Telegram bot interface
npm run voice                 # Alfred voice assistant (requires RPi hardware)
npm run alfred                # ForecastAgent + Alfred together

# Companion services (required for full functionality)
cd ../forecast-agent && npm run dev   # A2A ForecastAgent (port varies, see agent card)
cd ../agentiq-mcp-server && npm run dev  # MCP server (STDIO-based)

# Observability
npm run anomaly               # Run anomaly detection manually (LangSmith + Haiku + email)
docker-compose up -d anomaly-cron   # Start daily cron container

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
- **Native** — in-process (chart, web_search, email, calculator)
- **MCP** — STDIO protocol via `agentiq-mcp-server/` (query_database → PostgreSQL)
- **A2A** — HTTP protocol via `forecast-agent/` (forecast_revenue, discovered dynamically from Agent Card)

MCP and A2A tools are injected into the agent constructor; A2A tools are discovered at startup from `/.well-known/agent.json`.

### Prompt Caching (3/4 slots used)
- Slot 1: System prompt (`cache_control: ephemeral` on system content block)
- Slot 2: Tool definitions (cache boundary on last tool in array)
- Slot 3: Conversation history (`markHistoryCacheBoundary()` marks last message before new push)
- Slot 4: Reserved for RAG

### Key Files
| Path | Purpose |
|------|---------|
| `src/agent/agent.ts` | ReAct loop + all private orchestration methods |
| `src/agent/prompts.ts` | All prompts: system, router, summary, anomaly |
| `src/agent/models.ts` | `CLAUDE` constants (Haiku/Sonnet model IDs) |
| `src/config/clients.ts` | Shared Anthropic + OpenAI singletons, LangSmith-wrapped |
| `src/mcp/bootstrap.ts` | `initializeMCPClients()` |
| `src/a2a/forecastClient.ts` | `initializeA2ATools()` + A2A discovery |
| `src/services/cacheService.ts` | Semantic cache + pgvector |
| `src/services/routerService.ts` | Haiku router → returns model string |
| `src/services/summaryService.ts` | Token-aware history summarization |
| `src/utils/circuitBreaker.ts` | opossum circuit breaker registry (MCP/A2A only) |
| `src/tools/chartTool.ts` | Chart.js + S3 upload; exports `getLastChartUrl`/`clearLastChartUrl` |
| `src/services/faceService.ts` | WebSocket server (port 3002) + `sendChart()` to RPi face |
| `src/services/anomalyService.ts` | LangSmith trace fetch → Haiku analysis → email |

### Companion Projects (sibling directories)
- `../agentiq-mcp-server/` — Standalone MCP server exposing `query_database` over STDIO
- `../forecast-agent/` — Standalone A2A agent with Agent Card, exposes `forecast_revenue`

### Alfred Voice Interface
Alfred is a wake-word-activated voice assistant deployed on a Raspberry Pi 4 with a 7" touchscreen. Flow: Picovoice wake word → Deepgram streaming STT → agent → Google Cloud TTS → audio playback. Chart URLs are read from `chartTool.lastChartUrl` (module state) and sent via WebSocket to `face.html` as a fullscreen overlay before speech begins.

### Interfaces
- `src/interfaces/index.ts` — CLI single query
- `src/interfaces/interactive.ts` — conversational CLI with session memory
- `src/interfaces/telegramBot.ts` — Telegram bot (text + voice)
- `src/interfaces/alfred.ts` — Alfred wake word loop

### Pitch Presentation
`pitch/biagent-presentation.html` — standalone single-file reveal-style HTML presentation. No build step; open directly in a browser.

**Navigation:** Enter / Space / ArrowRight advance steps within a slide (revealing elements one by one). ArrowRight at the end of a slide moves to the next slide (clean slate). Click also advances.

**Aesthetic — "old money" dark mode:**
- Background: `#1c1812`, cream: `#e8dfc8`, parchment: `#c4b89a`, green: `#3d6456`, gold: `#b8a07a`, dim: `#4a4035`
- Grain texture overlay on body (SVG noise filter)
- Corner bracket ornaments top-left / bottom-right
- Title font: Cormorant Garamond (thin, spaced, uppercase)
- Body font: Libre Baskerville
- Labels/mono: DM Mono

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
PICOVOICE_ACCESS_KEY     # Alfred only
GOOGLE_APPLICATION_CREDENTIALS  # Alfred TTS only
```
