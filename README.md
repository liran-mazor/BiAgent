# BiAgent - Autonomous Business Intelligence Agent

> **D⚠️ emo project** for agentic AI engineering interviews. Built from scratch — no LangChain, no frameworks.

An AI agent that autonomously answers business questions by reasoning through problems and selecting the right tools — using the ReAct (Reasoning + Acting) pattern.

## Tech Stack

**Core:** Node.js · TypeScript · Claude Sonnet 4 + Haiku 4.5 · PostgreSQL + pgvector  
**Protocols:** Model Context Protocol · Agent-to-Agent Protocol
**Voice:** Picovoice Porcupine · Deepgram STT · Google Cloud TTS  
**Infra:** Docker · AWS S3 · LangSmith · Telegram Bot API

---

## Six Engineering Phases

**Phase 1 — Performance:** Semantic caching (pgvector + embeddings) and parallel tool execution.

**Phase 2 — MCP Integration:** Standalone MCP server exposes SQL tool via STDIO. Agent acts as MCP client with dynamic tool discovery at startup.

**Phase 3 — Router:** Haiku routes queries to itself (simple) or Sonnet (complex).

**Phase 4 — A2A Multi-Agent Architecture:** Standalone ForecastAgent with Agent Card. BiAgent discovers and registers tools dynamically — zero hardcoding. Three-tier tool resolution: Native → MCP (STDIO) → A2A (HTTP).

**Phase 5 — Context Engineering + Prompt Caching:** Multi-layer prompt caching (3/4 slots). Token-aware history summarization. Circuit breaker with opossum for MCP/A2A resilience.

**Phase 6 — Observability:** LangSmith tracing wrapped at the client level — zero agent code changes. Daily anomaly detection where Haiku analyzes traces and emails the team. Containerized as a Docker cron job.

---

## Tools (4 Native + 1 MCP + 1 A2A)

| Tool | Type | Description |
|------|------|-------------|
| `query_database` | MCP (STDIO) | PostgreSQL queries via standalone MCP server |
| `forecast_revenue` | A2A (HTTP) | Revenue forecasting via standalone ForecastAgent |
| `chart` | Native | Chart.js visualization + AWS S3 upload |
| `web_search` | Native | Tavily API for benchmarks and market data |
| `email` | Native | Nodemailer with role resolution (team_leader, vp) |
| `calculator` | Native | Math.js for growth rates and statistics |

---

## 4 Interfaces

- **CLI** — `npm start "query"`
- **Interactive CLI** — `npm run interactive`
- **Telegram Bot** — text + voice messages: `npm run bot`
- **Alfred** — wake word voice assistant: `npm run voice`

Alfred uses Picovoice for wake word detection, Deepgram for streaming STT with automatic voice activity detection, and Google Cloud TTS for British-voiced responses.

---

## System Architecture

```
   ┌───────────────────────────────────────────────┐
   │               User Interfaces                 │
   ├─────────────────┬─────────────────────────────┤
   │  CLI Terminal   │  Telegram Bot (Voice/Text)  │
   └──────┬──────────┴───────────────────┬─────────┘
          │                              │
       Text Query                   Voice ──► OpenAI Whisper
          │                              │
          └───────────────┬──────────────┘
                          ▼
              ◆───────────────────────◆
              │    Semantic Cache     │ 
              │ pgvector + embeddings │
              ◆───────────┬───────────◆
                          │
                      ┌───┴───┐
                      │       │
                     Hit     Miss
                      │       │
                   Return     │
                              ▼
          ┌────────────────────────────┐
          │    Router (Haiku 3.5)      │  
          │  Analyzes query complexity │
          └──────────────┬─────────────┘
                         │
                ┌────────┴────────┐
                ▼                 ▼
          ┌───────────┐     ┌───────────┐
          │ Haiku 3.5 │     │ Sonnet 4  │
          │  (Simple) │     │ (Complex) │
          └─────┬─────┘     └─────┬─────┘
                │                 │
                └────────┬────────┘
                         ▼
         ┌─────────────────────────────────┐
         │      BiAgent - ReAct Core       │
         │ • Conversation Memory           │
         │ • Prompt Caching (3/4 slots)    │
         │ • Parallel Tool Execution       │
         │ • Token-based Summarization     │
         └─────────────────────────────────┘
                         │
       ┌─────────────────┼──────────────────┐
       │                 │                  │
       ▼                 ▼                  ▼                 
  ┌──────────┐      ┌──────────┐       ┌──────────────┐ 
  │ MCP Tool │      │ A2A tool │       │ Native Tools │ 
  └─────┬────┘      └────┬─────┘       └──────┬───────┘ 
        │                │                    │      
      STDIO             HTTP              In-process
        │                │                    │             
        ▼                ▼                    ▼             
┌───────────────┐ ┌────────────────┐ ┌─────────────────┐
│   MCP Server  │ │ ForecastAgent  │ │ • Chart.js + S3 │
│query_database │ │forecast_revenue│ │ • Web Search    │
│       +       │ └────────────────┘ │ • Email         │
│  PostgreSQL   │                    │ • Calculator    │
└───────────────┘                    └─────────────────┘
```

---

## Quick Start

```bash
# Infrastructure
docker-compose up -d
npm run init-db && npm run seed

# Start ForecastAgent (required for A2A)
cd forecast-agent && npm run dev

# Run BiAgent
npm start "What's our revenue this month?"
npm run interactive
npm run bot
npm run voice

# Observability
npm run anomaly                          # Manual anomaly check
docker-compose up -d anomaly-cron        # Daily cron container
```

---

**Built by:** Liran Mazor · **Purpose:** Agentic AI engineering interviews