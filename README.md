# BiAgent - Autonomous Business Intelligence Agent

> **Demo project** for agentic AI engineering interviews. Built from scratch — no LangChain/LangGraph frameworks.

An AI agent that autonomously answers business questions through reasoning and tool selection using the ReAct pattern.

## Tech Stack

**Core:** Node.js · TypeScript · Claude Sonnet 4.6 + Haiku 4.5 · PostgreSQL + pgvector
**Data:** Kafka · ClickHouse · Event Sourcing with Outbox Pattern
**Protocols:** Agent-to-Agent (A2A) · JWT Auth via Kong
**Voice:** Picovoice Porcupine · Deepgram STT · Google Cloud TTS
**Infra:** Docker · Kubernetes · AWS S3 · LangSmith

---

## Architecture

**Orchestrator + 2 A2A Agents:**

```
┌──────────────────────────────────────────┐
│          BiAgent Orchestrator            │
│  • Router (Haiku) — pattern + availability │
│  • FUNCTION_CALL (Haiku) or REACT (Sonnet) │
│  • Prompt caching (3/4 slots)            │
│  • Circuit breaker → immediate exit      │
└──────────────────────────────────────────┘
          │                    │
          ▼                    ▼
    ┌──────────────┐    ┌──────────────┐
    │ Knowledge    │    │ Analytics    │
    │ Agent        │    │ Agent        │
    │ (pgvector)   │    │ (ClickHouse) │
    └──────────────┘    └──────────────┘
```

**Key Design Decisions:**
- **Router** — Haiku decides execution pattern (simple vs complex) *before* expensive LLM calls. If circuit breaker open, returns immediately.
- **Dual model strategy** — Haiku for routing and FUNCTION_CALL queries; Sonnet for ReAct loops (complex multi-step reasoning).
- **Cost engineering** — Prompt caching reduces token cost ~90% after first call. Synthesis grounding prevents hallucination. Tool batching parallelizes independent calls.

**Tool Inventory:**
- `query_knowledge` — RAG pipeline (pgvector + Cohere rerank + gpt-4o-mini)
- `query_analytics` — SQL SELECT via ClickHouse
- `chart` — Chart.js visualization + S3 upload
- `email` — SMTP via nodemailer
- `web_search` — Tavily API
- `forecast_revenue` — Linear trend forecasting

---

## Interfaces

- **CLI** — single query
- **Interactive CLI** — conversational with memory
- **Telegram Bot** — text + voice messages
- **Alfred** — wake-word voice assistant (Raspberry Pi). Queries prefixed with `[VOICE_INTERFACE]` trigger one-sentence responses; charts display on 7" touchscreen

---

**Built by:** Liran Mazor
