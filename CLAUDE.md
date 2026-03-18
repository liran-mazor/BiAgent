# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Infrastructure (required before running the agent)
docker-compose up -d          # Start PostgreSQL
npm run init-db               # Initialize DB schema (runs in mcp-server)
npm run seed                  # Seed sample data

# Run BiAgent (starts all 5 agents + interface)
npm start "query"             # Single query via CLI
npm run interactive           # Conversational CLI
npm run dev                   # CLI + all 5 agents
npm run alfred                # Alfred voice (RPi) + all 5 agents
npm run telegram              # Telegram bot + all 5 agents

# Run interfaces individually (agents must be started separately)
npm run voice                 # Alfred only
npm run bot                   # Telegram bot only

# Start individual agents
npm run dev -w agents/sql-agent
npm run dev -w agents/observability-agent
npm run dev -w agents/analytics-agent
npm run dev -w agents/comms-agent
npm run dev -w agents/research-agent

# Maintenance
npm run daily-seed            # Seed new daily data
```

TypeScript is run directly with `tsx` — no build step needed.

## Architecture

BiAgent is a ReAct-pattern autonomous agent built from scratch (no LangChain/LangGraph). The agent loop lives in `src/agent/agent.ts`.

The orchestrator is a **pure router** — it has no native tools. All capabilities live in standalone A2A agents under `agents/`. Each agent exposes an Agent Card at `/.well-known/agent.json` and accepts tasks via `POST /tasks`.

### Query Lifecycle (agent.ts `run()`)
1. `routeQuery()` → Haiku decides: model (Haiku/Sonnet), pattern (FUNCTION_CALL/REACT), or returns `unavailableResponse` if required tools are down
2. If `unavailableResponse` → return immediately, zero further LLM calls
3. `formatToolsForClaude()` — called once per `run()`, reused across all iterations
4. `summarizeIfNeeded()` → token count check → compress history with structured summary if >170k tokens → selective injection based on current query
5. `markHistoryCacheBoundary()` → marks prompt cache slot 3
6. `createUserPrompt()` → injects current date + circuit breaker warnings
7. **FUNCTION_CALL path** → `runFunctionCall()`: one tool call + one final answer, flat context, no loop
8. **REACT path** → iterative loop: `callLLM()` → parallel `executeTool()` with circuit breaker → repeat until final answer

### A2A-Only Tool Resolution
All tools are A2A — discovered dynamically from Agent Cards on startup. `initializeA2ATools(a2aAgents)` loops all configured agents, fetches each agent card, and flattens all tasks into one `A2ATool[]`. On failure per agent: warn and continue.

### Agent Pattern
Every agent: Express server with `GET /.well-known/agent.json` + `POST /tasks`. No LLM except observability-agent. Standard response: `{ status: 'completed', result: { ... } }`.

### Tool Inventory (A2A agents)
| Agent | Port | Tasks |
|-------|------|-------|
| `agents/sql-agent` | 3001 | `query_database` — SQL against PostgreSQL via MCP internally |
| `agents/observability-agent` | 3002 | `query_observability` — LangSmith traces via Haiku |
| `agents/analytics-agent` | 3003 | `chart`, `forecast_revenue` |
| `agents/comms-agent` | 3004 | `email` |
| `agents/research-agent` | 3005 | `web_search` |

Port 3006 is used by `faceService.ts` (WebSocket server for RPi face display — not an A2A agent).

### Prompt Caching (3/4 slots used)
- Slot 1: System prompt (`cache_control: ephemeral` on system content block)
- Slot 2: Tool definitions (cache boundary on last tool in array)
- Slot 3: Conversation history (`markHistoryCacheBoundary()` marks last message before new push)
- Slot 4: Reserved for RAG

### Query Router
`routerService.ts` sends the query + open circuit breakers to Haiku via forced tool use (`route_query`). Returns:
- `model`: Haiku (simple) or Sonnet (complex)
- `pattern`: FUNCTION_CALL (single pass) or REACT (iterative loop)
- `unavailableResponse`: set when required tools are down — returned immediately, no further LLM calls

### Context Management
Token count tracked per-conversation. Triggers structured summarization at 170k tokens (85% of 200k limit). Haiku compresses history via forced tool use into a `StructuredSummary` (topic, key_facts, resolved_entities, queries_run, open_questions). `formatSummaryForContext(summary, query)` selectively injects only relevant fields based on the current query. Lives in `summaryService.ts`.

### Circuit Breaker
`src/utils/circuitBreaker.ts` — opossum-based registry keyed by tool name. Applied to all A2A tools. A2A config: 30s timeout, 50% error threshold, 10s reset timeout.

The circuit breaker is **closed-loop**: a module-level `openCircuits: Set<string>` is updated on every `open`/`close` event. `getOpenCircuits()` is called once per `run()` and passed to both `routeQuery()` (for availability routing) and `createUserPrompt()` (for ReAct loop warnings).

### Chart URL Propagation
After a `chart` A2A call, `executeTool()` captures `result.result.chartUrl` into `agent.lastChartUrl`. Interfaces call `agent.getLastChartUrl()` / `agent.clearLastChartUrl()` after each query to send the chart image (Telegram) or push it to the RPi face (Alfred).

### LangSmith Observability
Both Anthropic and OpenAI clients are wrapped with LangSmith (`wrapSDK`, `wrapOpenAI`) in `src/config/clients.ts`. Zero agent code changes needed — all LLM calls traced automatically.

### Key Files
| Path | Purpose |
|------|---------|
| `src/agent/agent.ts` | Query lifecycle + all private orchestration methods |
| `src/agent/prompts.ts` | All prompts: system, router, summary |
| `src/agent/models.ts` | `MODEL` constants (Haiku/Sonnet model IDs) |
| `src/config/clients.ts` | Shared Anthropic + OpenAI singletons, LangSmith-wrapped |
| `src/a2a/a2aClient.ts` | `initializeA2ATools()` — loops all agents, fetches Agent Cards |
| `src/a2a/a2aServers.ts` | Agent URL configs (one entry per agent) |
| `src/services/routerService.ts` | Haiku router → model + pattern + availability |
| `src/services/summaryService.ts` | Structured history summarization + selective injection |
| `src/utils/circuitBreaker.ts` | opossum circuit breaker registry (A2A only) |
| `src/services/faceService.ts` | WebSocket server (port 3006) + `sendChart()` to RPi face |
| `agents/sql-agent/` | Port 3001 — query_database via MCP internally |
| `agents/observability-agent/` | Port 3002 — LangSmith trace analysis |
| `agents/analytics-agent/` | Port 3003 — chart generation + revenue forecasting |
| `agents/comms-agent/` | Port 3004 — email sending |
| `agents/research-agent/` | Port 3005 — Tavily web search |
| `mcp-server/` | STDIO MCP server — PostgreSQL query_database tool |

### Alfred Voice Interface
Wake-word-activated assistant deployed on Raspberry Pi 4 with 7" touchscreen.

**Flow:** Picovoice wake word ("Alfred") → stop recorder → play "All ears" → record 7s → play "On it" → Whisper STT → agent (with `[VOICE_INTERFACE]` prefix for short responses) → Google Cloud TTS → audio playback.

**Chart display:** After each query, `agent.getLastChartUrl()` is checked. If a chart was generated, `faceService.sendChart(url)` pushes it via WebSocket to `face.html` as a fullscreen overlay — sent *before* `play()` so it appears as Alfred starts speaking. `agent.clearLastChartUrl()` prevents stale charts across queries.

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

### Project Description
Built a multi-agent BI system where a router decides between two execution patterns — single-pass for simple queries, iterative ReAct loop for complex ones that need multi-step reasoning.

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
SQL_AGENT_URL=http://localhost:3001
OBSERVABILITY_AGENT_URL=http://localhost:3002
ANALYTICS_AGENT_URL=http://localhost:3003
COMMS_AGENT_URL=http://localhost:3004
RESEARCH_AGENT_URL=http://localhost:3005
PICOVOICE_ACCESS_KEY     # Alfred only
GOOGLE_APPLICATION_CREDENTIALS  # Alfred TTS only
```
