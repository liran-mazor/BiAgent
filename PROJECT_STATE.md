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

## Current state

**Name:** BiAgent (renamed from AgentIQ)
**Sibling agents:** `agentiq-mcp-server` (MCP, STDIO), `anomaly-detector-agent` (A2A, port 3003)
**Tool count:** 4 native + 1 MCP + 1 A2A
**Interfaces:** CLI, interactive CLI, Telegram bot, Alfred (RPi voice)

The forecasting logic moved from A2A into a native tool (simpler, faster, no network hop). The A2A slot is now occupied by anomaly detection, which genuinely needs to be a separate service — it has its own LangSmith dependency and runs independently. The A2A agent is now auto-started by the convenience scripts (`npm run alfred`, `npm run telegram`, `npm run dev`).

---

*Last updated: March 2026*
