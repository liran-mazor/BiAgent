# BiAgent - Project State (LLM Context Document)

## Overview
Autonomous BI Agent demonstrating ReAct pattern with **MCP protocol integration**, **intelligent cost optimization**, and **A2A multi-agent architecture**. Built from scratch (no LangChain) for agentic AI engineering interviews.

**Stack:** Node.js, TypeScript, Claude Sonnet 4 + Haiku 4.5, PostgreSQL+pgvector (Docker), OpenAI embeddings, Chart.js, Tavily API, Whisper, Telegram Bot, AWS S3, Model Context Protocol (MCP), Agent-to-Agent Protocol (A2A), Google Cloud TTS, Picovoice, LangSmith

---

## Current Status: PHASE 6 COMPLETE ✅

### Core Capabilities
- **Intelligent Model Routing**: Haiku analyzes query complexity → routes to Haiku (simple) or Sonnet (complex)
- **MCP Protocol Integration**: Agent acts as MCP client, connects to standalone MCP servers
- **A2A Protocol Integration**: BiAgent discovers and delegates to ForecastAgent via A2A protocol
- **Dynamic Tool Discovery**: A2A tools registered at runtime from Agent Cards — zero hardcoding
- **Three-Tier Tool Architecture**: Native → MCP → A2A
- **Hybrid Tool Architecture**: Seamlessly combines native, MCP, and A2A tools
- **Conversation Memory**: Per-session history in Map<sessionId, messages[]>
- **Cloud Storage**: Charts auto-uploaded to AWS S3 with public URLs
- **Voice Interfaces**: Telegram bot + Alfred wake word assistant
- **Autonomous Multi-Tool Chains**: MCP SQL → A2A Forecast → Native Chart → Native Email in single query
- **Role-Based Email**: "team_leader" → resolves to actual email from config
- **Full Observability**: LangSmith tracing on all LLM calls + daily anomaly detection via Haiku
- **Chart Display on Touchscreen**: Alfred displays S3 chart overlay on 7" RPi screen while speaking

### Tool Architecture (4 Native + 1 MCP + 1 A2A)

**Native Tools (in-process):**
1. **chart** - Chart.js visualization + AWS S3 upload
2. **web_search** - Tavily API for benchmarks/competitor data
3. **email** - Nodemailer with role resolution (team config co-located in emailTool.ts)
4. **calculator** - Math.js for calculations

**MCP Tools (via STDIO protocol):**
1. **query_database** - PostgreSQL queries via standalone MCP server (5 tables: customers, products, orders, order_items, reviews)

**A2A Tools (via HTTP protocol):**
1. **forecast_revenue** - Revenue forecasting via standalone ForecastAgent (discovered dynamically at startup)

### 4 User Interfaces
1. **CLI** - Single query: `npm start "query"`
2. **Interactive CLI** - Conversational: `npm run interactive`
3. **Telegram Bot** - Text + Voice: `npm run bot`
4. **Voice Interface (Alfred)** - Wake word activated: `npm run voice`

**Alfred Voice Interface - Tech Stack:**
- **Wake Word Detection:** Picovoice Porcupine (`@picovoice/porcupine-node`, `@picovoice/pvrecorder-node`)
  - Custom trained wake word: "Alfred"
  - Sensitivity: 0.9 for responsive detection
  - Custom .ppn model file stored in `src/voice/audio/alfred.ppn`
- **Audio Recording:** `node-record-lpcm16` with Sox backend (7-second clips, 16kHz mono WAV)
- **Speech-to-Text:** OpenAI Whisper API (`whisper-1` model)
- **Text-to-Speech:** Google Cloud TTS (`@google-cloud/text-to-speech`)
  - Voice: `en-GB-Neural2-B` (British male narrator)
  - Pre-generated acknowledgments stored in `src/voice/audio/`:
    - `confirmation.mp3`: "All ears" (wake word confirmation)
    - `ack.mp3`: "On it" (processing acknowledgment)
- **Audio Playback:** `play-sound` library with 150ms buffer delay to prevent audio clipping
- **Audio Timing:** 400ms delay after stopping recorder before playing confirmation (prevents resource conflicts)
- **Cancel command:** Saying "stop" after wake word returns Alfred to listening state

**Alfred Flow:**
1. Wake word detected ("Alfred") → Stop recorder
2. Play "All ears" confirmation → Record 7 seconds
3. Play "On it" → Whisper transcription
4. If "stop" → restart listening loop
5. Agent processing with [VOICE_INTERFACE] prefix (triggers 1-2 sentence responses)
6. TTS response with Google Cloud TTS → Play audio
7. If chart was generated → display S3 chart as overlay on touchscreen while speaking

**Alfred Chart Display:**
- `chartTool.ts` stores last S3 URL in module-level `lastChartUrl`
- `alfred.ts` calls `getLastChartUrl()` then immediately `clearLastChartUrl()` after each query
- `faceService.ts` `sendChart(url)` sends `{ type: 'chart', url }` via WebSocket to face.html
- Chart overlay appears **before** `play()` so it's visible as Alfred begins speaking
- ✕ button dismisses overlay and returns face to idle state
- RPi-specific lip sync delays: 950ms for both `sendQuickMouth` and `sendSpeaking`

---

## Optimization Phases

### Phase 1: Performance Optimizations - COMPLETED ✅

#### 1. Prompt Caching
- **Implementation:** System prompt as content block with `cache_control: { type: 'ephemeral' }`
- **Impact:** 90% discount on cached tokens after first request

#### 2. Tool Call Batching
- **Implementation:** `Promise.all()` for parallel tool execution
- **Impact:** 40-50% latency reduction when Claude calls multiple tools simultaneously

#### 3. Semantic Caching with pgvector ⭐
- **Architecture:** OpenAI embeddings → pgvector similarity search → cache hit/miss
- **Logic:**
  1. Embed query → similarity search in pgvector
  2. If distance < 0.15 (85% similarity) → return cached response
  3. Else → run agent → cache result with smart TTL
- **Smart TTL:** 5min (real-time) / 1hr (recent) / 7 days (historical) / 24hr (default)

---

### Phase 2: MCP Integration - COMPLETED ✅

Standalone MCP server exposing SQL tools via STDIO. Agent acts as MCP client with dynamic tool discovery at startup.

```
agentiq-mcp-server/
├── src/
│   ├── index.ts          # MCP server + tool handlers
│   ├── db.ts             # PostgreSQL pool
│   └── scripts/          # seed, dailySeed, clearCache
└── package.json
```

---

### Phase 3: Intelligent Cost Optimization - COMPLETED ✅

**Model constants (`src/agent/models.ts`):**
```typescript
export const CLAUDE = {
  Haiku: 'claude-haiku-4-5-20251001',
  Sonnet: 'claude-sonnet-4-20250514'
} as const;
```

**Router returns model string directly:**
```typescript
export async function routeQuery(query: string): Promise<string> {
  // Returns CLAUDE.Haiku or CLAUDE.Sonnet
}
```

Cost reduction: ~70% on typical workload (85% Haiku / 15% Sonnet split).

---

### Phase 4: A2A Multi-Agent Architecture - COMPLETED ✅

Standalone ForecastAgent with Agent Card at `/.well-known/agent.json`. BiAgent discovers and registers tools dynamically at startup — zero hardcoding.

```
forecast-agent/
├── src/
│   ├── index.ts        # Express + taskMap O(1) router
│   ├── agentCard.ts    # Agent Card with JSON Schema
│   └── forecastTool.ts # Linear trend forecasting + Zod
└── package.json
```

**Three-tier tool resolution:**
```typescript
// 1. Native → in-process
// 2. MCP → STDIO protocol  
// 3. A2A → HTTP protocol
```

---

### Phase 5: Context Engineering + Production Hardening - COMPLETED ✅

#### 1. Multi-Layer Prompt Caching (3/4 Cache Slots)

**Slot 1 - System Prompt:**
```typescript
system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }]
```

**Slot 2 - Tool Definitions** (cache boundary on last tool):
```typescript
return allTools.map((tool, index) =>
  index === allTools.length - 1
    ? { ...tool, cache_control: { type: 'ephemeral' } }
    : tool
);
```

**Slot 3 - Conversation History** (`markHistoryCacheBoundary()` — marks last message before new push):

**Slot 4:** Reserved for future RAG document caching.

Impact: From iteration 2 onwards, only the current message is processed at full cost.

#### 2. Token-Based History Summarization
- Replaced arbitrary sliding window (20 messages) with `countTokens` API
- Triggers at 170k tokens (85% of 200k limit)
- Compresses old half of history with Haiku → no context truly lost
- `src/services/summaryService.ts` + `src/agent/prompts.ts`

#### 3. Circuit Breaker for Network Tools
- `src/utils/circuitBreaker.ts` — opossum-based, module-level breaker registry
- Each MCP/A2A tool gets its own breaker instance (keyed by tool name)
- Config: 5s timeout, 50% error threshold, 10s reset
- Graceful fallback response when circuit is open
- Native tools excluded — in-process, no network calls

```typescript
const CIRCUIT_BREAKER_OPTIONS = {
  timeout: 5000,
  errorThresholdPercentage: 50,
  resetTimeout: 10000
} as const;
```

#### 4. Agent Refactoring (Clean Architecture)
`run()` is now a clean orchestration loop delegating to private methods:
- `callLLM()` — Claude API call with cached system + tools
- `executeTool()` — three-tier resolution + circuit breaker
- `manageContext()` — token count → summarize → mark cache boundary
- `markHistoryCacheBoundary()` — normalize content blocks + add cache marker
- `handleFinalResponse()` — store session + cache response
- `checkToolFailures()` — validate tool results

`formatToolsForClaude()` called once per `run()`, reused across all iterations.

#### 5. Additional Polish
- `src/config/clients.ts` — shared Anthropic + OpenAI singletons (wrapped with LangSmith)
- `routeQuery()` returns model string directly (not complexity string)
- Telegram bot handlers moved inside `startBot()` — agent is `const`
- Alfred cancel: "stop" → `continue` back to wake word listening
- `import 'dotenv/config'` consistently across all entry points
- MCP tools initialized with `initializeMCPClients()`, A2A with `initializeA2ATools()` — consistent naming
- All prompts consolidated in `src/agent/prompts.ts`

---

### Phase 6: Observability, Anomaly Detection & Chart Display - COMPLETED ✅

#### 1. LangSmith Tracing
- Wrapped both Anthropic and OpenAI clients with LangSmith SDK (`wrapSDK`, `wrapOpenAI`)
- Every LLM call, tool execution, and ReAct iteration automatically traced
- Dashboard at smith.langchain.com shows latency, tokens, cost, full input/output payloads
- Zero code changes to agent logic — purely infrastructure-level wrapping in `clients.ts`

```typescript
export const anthropic = wrapSDK(new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! }));
export const openai = wrapOpenAI(new OpenAI({ apiKey: process.env.OPENAI_API_KEY! }));
```

**Required env vars:**
```
LANGSMITH_TRACING=true
LANGSMITH_ENDPOINT=https://api.smith.langchain.com
LANGSMITH_API_KEY=your-key
LANGSMITH_PROJECT=BiAgent
```

#### 2. AI-Powered Anomaly Detection (`src/services/anomalyService.ts`)
- Fetches last 20 LLM traces from LangSmith API using the LangSmith TypeScript SDK
- Summarizes traces: latency, token counts, status, errors per call
- Sends summary to **Haiku** with a structured prompt asking it to identify anomalies
- Haiku checks for: latency spikes, zero/high token counts, failures, high variance
- Emails anomaly report to team leader via existing email tool
- Smart subject line: 🚨 "Action required" vs ✅ "All good" based on Haiku's findings
- Anomaly prompt stored in `src/agent/prompts.ts` alongside other prompts

```typescript
// Haiku monitors Sonnet — the cheaper model watches the expensive one
const anomalies = await detectAnomalies(summary);
```

#### 3. Dockerized Cron Job
- `Dockerfile.anomaly` — standalone container with Node 20 Alpine + tsx
- Runs `anomalyService.ts` every day at 9am via Alpine crond
- Completely decoupled from main agent — zero performance impact
- Logs to `/var/log/anomaly.log` inside container

```yaml
anomaly-cron:
  build:
    context: .
    dockerfile: Dockerfile.anomaly
  env_file: .env
  restart: unless-stopped
```

**To test manually (without waiting for cron):**
```bash
npm run anomaly
```

#### 4. Chart Display on Alfred Touchscreen ⭐
- When Alfred generates a chart, it displays as a fullscreen overlay on the 7" RPi touchscreen **while speaking**
- `chartTool.ts` stores last S3 URL in module-level `lastChartUrl` variable
- `getLastChartUrl()` + `clearLastChartUrl()` exports prevent stale chart from persisting across queries
- `faceService.ts` `sendChart(url)` sends via WebSocket to face.html
- `face.html` renders image overlay with ✕ dismiss button
- Chart sent **before** `play()` — visible as Alfred begins speaking the response
- RPi-specific timing: 950ms delay on both quickmouth animations and final response lip sync

**Key design decision:** Read chart URL from module state (`lastChartUrl`) rather than parsing agent response text — voice responses are intentionally short and never contain S3 URLs.

---

## Architecture Essentials

### ReAct Loop (agent.ts)
1. Check semantic cache → return immediately on hit
2. `routeQuery()` → model string
3. `formatToolsForClaude()` once → reused across all iterations
4. `manageContext()` → countTokens → summarize if needed → mark cache boundary
5. Push new user message
6. `callLLM()` → Claude API (cached system + tools + history)
7. If tool calls → `executeTool()` in parallel → circuit breaker for MCP/A2A
8. `checkToolFailures()` → continue or bail
9. `handleFinalResponse()` → store session → cache → return

### Key Design Decisions
- **Dependency injection**: MCP + A2A tools injected into constructor
- **Single responsibility**: Each private method owns one concern
- **Module-level singletons**: Circuit breakers, API clients — instantiated once
- **Haiku for infrastructure tasks**: routing, summarization, token counting, anomaly detection

---

## File Structure
```
biagent/
├── src/
│   ├── a2a/
│   │   ├── forecastClient.ts     # A2A discovery + initializeA2ATools()
│   │   └── types.ts
│   ├── agent/
│   │   ├── agent.ts              # ReAct loop + private methods
│   │   ├── prompts.ts            # All prompts: system, router, summary, anomaly
│   │   └── models.ts             # CLAUDE model constants
│   ├── config/
│   │   └── clients.ts            # Shared Anthropic + OpenAI singletons (LangSmith wrapped)
│   ├── interfaces/
│   │   ├── index.ts              # CLI
│   │   ├── interactive.ts        # Interactive CLI
│   │   ├── telegramBot.ts        # Telegram bot
│   │   └── alfred.ts             # Alfred wake word loop + chart display
│   ├── mcp/
│   │   ├── bootstrap.ts          # initializeMCPClients()
│   │   ├── client.ts             # MCPClient class
│   │   ├── mcpServers.ts         # MCP server config
│   │   └── types.ts
│   ├── services/
│   │   ├── anomalyService.ts     # LangSmith trace fetch + Haiku analysis + email
│   │   ├── cacheService.ts       # Semantic cache + pgvector pool
│   │   ├── embeddingService.ts   # OpenAI embeddings
│   │   ├── faceService.ts        # WebSocket server (port 3002) + sendChart()
│   │   ├── routerService.ts      # Haiku router → model string
│   │   ├── summaryService.ts     # Haiku history summarization
│   │   └── s3Service.ts          # AWS S3 upload
│   ├── tools/
│   │   ├── calculatorTool.ts
│   │   ├── chartTool.ts          # lastChartUrl + getLastChartUrl/clearLastChartUrl
│   │   ├── emailTool.ts
│   │   ├── webSearchTool.ts
│   │   ├── index.ts
│   │   └── types.ts
│   ├── utils/
│   │   ├── circuitBreaker.ts     # opossum circuit breaker registry
│   │   ├── fileSystem.ts
│   │   ├── voiceHelpers.ts
│   │   └── zodToJsonSchema.ts
│   └── voice/
│       ├── audio/
│       │   ├── alfred.ppn
│       │   ├── confirmation.mp3
│       │   └── ack.mp3
│       ├── audioPaths.ts
│       ├── face.html             # Animated face + chart overlay
│       └── temp/
├── schema.sql
├── docker-compose.yml
├── Dockerfile.anomaly
└── package.json

agentiq-mcp-server/
forecast-agent/
```

---

## Interview Pitch (Updated)

> "BiAgent is an autonomous BI agent built from scratch using Claude's ReAct pattern — no frameworks. It demonstrates **production-grade engineering** across six phases:
>
> **Phase 1 - Performance Engineering:**
> Semantic caching with pgvector, prompt caching, parallel tool execution.
>
> **Phase 2 - Protocol-Level Architecture (MCP):**
> Standalone MCP server, agent as MCP client, hybrid tool execution.
>
> **Phase 3 - Intelligent Cost Optimization:**
> Two-tier LLM — Haiku routes to itself or Sonnet. ~70% cost reduction.
>
> **Phase 4 - A2A Multi-Agent Architecture:**
> Standalone ForecastAgent with Agent Card. BiAgent discovers tools dynamically. Three-tier resolution: Native → MCP (STDIO) → A2A (HTTP).
>
> **Phase 5 - Context Engineering + Production Hardening:**
> Multi-layer prompt caching (3/4 slots). Token-aware history summarization replacing arbitrary sliding window. Circuit breaker with opossum for MCP/A2A resilience. Clean agent architecture with single-responsibility private methods.
>
> **Phase 6 - Observability, Anomaly Detection & Multimodal Output:**
> LangSmith tracing wrapped at the client level — zero agent code changes. Daily anomaly detection where Haiku analyzes LangSmith traces and emails the team leader. Containerized as a Docker cron job. Alfred voice assistant deployed on Raspberry Pi 4 with 7" touchscreen — when the agent generates a chart, it's displayed as an overlay on the physical screen while Alfred speaks the answer, with lip-synced mouth animation."

---

## Quick Commands
```bash
# Infrastructure
docker-compose up -d
npm run init-db
npm run seed

# Run ForecastAgent (required for A2A)
cd forecast-agent && npm run dev

# Run BiAgent
npm start "What's our revenue this month?"
npm run interactive
npm run bot
npm run voice

# Test A2A flow
npm start "What was our monthly revenue for the last 6 months and forecast the next 3 months?"

# Observability
npm run anomaly          # Run anomaly detection manually
docker-compose up -d anomaly-cron  # Start daily cron container

# Maintenance
npm run clear-cache
npm run daily-seed
```

---

**Last Updated:** February 2026 (Phase 6: Observability, Anomaly Detection & Chart Display on RPi touchscreen)
**Status:** Production-optimized with MCP, A2A, intelligent routing, multi-modal voice, context engineering, circuit breaker resilience, LangSmith observability, AI-powered anomaly detection, and physical chart display on Raspberry Pi touchscreen
**Maintainer:** Liran Mazor
**Purpose:** Technical demonstration for agentic AI engineering interviews
