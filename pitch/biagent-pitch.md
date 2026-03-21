# BiAgent — The Pitch

---

## The Problem

BI tools give you dashboards. Dashboards tell you *what happened*.

But business decisions need two things: what the data shows, and what the business context means. No dashboard answers "is our revenue drop a problem or was it planned?"

BiAgent answers both in one query.

---

## The Demo Query

> "Our revenue dropped 12% this quarter — should we be concerned?"

A SQL query gives you the number. A chart shows the trend. But neither tells you whether the board approved a deliberate shift toward acquisition over margin this quarter — whether this is a fire drill or a feature.

That context lives in a strategy doc. BiAgent retrieves it, combines it with the DB data, and answers the whole question.

---

## The Architecture

Two execution patterns, decided per query by a Haiku router before the main agent runs:

**FUNCTION_CALL** — simple queries. One tool call, one answer. Haiku. Flat context, no loop.
> "What was our revenue last month?" → query DB → answer.

**REACT** — complex queries. Iterative reasoning loop. Sonnet. Runs until it has a complete answer.
> "Revenue is down 12% — should we be concerned?" → query DB + query knowledge base in parallel → synthesize.

---

## Why a Second Agent for RAG

The retrieval pipeline — chunking, embedding, vector search, reranking, synthesis — is complex enough to deserve its own process.

The knowledge-agent receives a question, runs its full pipeline internally, and returns one clean answer. BiAgent never sees the raw document chunks. The orchestrator's context stays clean.

This is A2A (Agent-to-Agent): one agent delegating a task to another over HTTP, each with its own context window.

---

## The Knowledge Base

Six internal documents. Each one enables a class of question that SQL alone cannot answer:

| Document | Questions it enables |
|----------|---------------------|
| `2026-annual-plan.md` | "Does Q1 2026 match expectations?" · "Why is January revenue slow?" · "What's the plan for Books this year?" |
| `2025-year-end-review.md` | "Was 2025 a good year?" · "Did Sports hit its target?" · "What changed vs the plan?" |
| `q3-2025-board-update.md` | "What did the board decide mid-year?" · "Was there a course correction in 2025?" |
| `pricing-policy-2025.md` | "Can we do 25% off Sports this weekend?" · "What's the margin floor on Electronics?" |
| `emea-expansion-analysis.md` | "What did we decide about EMEA?" · "When does the UK pilot launch?" |
| `2025-annual-plan.md` | "What was the original plan for Sports?" · "What did we commit to the board for 2025?" |

The SQL agent gives you the numbers. These documents give you the decisions, commitments, and context behind them.

---

## What It Can Answer

| Persona | Example |
|---------|---------|
| Analyst | "Which product categories are declining and why?" |
| Finance | "Is our Q4 revenue on plan per the board deck?" |
| Executive | "What did we decide about the EMEA expansion?" |

The last two questions are impossible without RAG. The SQL agent tells you what happened. The knowledge agent tells you what it means.

---

## The Prompt Engineering

Prompt engineering isn't just the system prompt. It's every instruction that shapes model behavior — per tool, per interface, per failure mode.

- **N+1 prevention in the SQL tool** — the system prompt explicitly tells the model: "never query for a list then loop over results with per-row queries. Bad: fetch all orders, then query each customer separately. Good: one query with a JOIN." This prevents a class of LLM-generated SQL that works but destroys database performance.
- **Tool batching guidance** — the system prompt tells the model to call independent tools in the same iteration. "query_database + query_knowledge can run in parallel — call them together, not sequentially." Without this, the model defaults to sequential calls and doubles the latency.
- **Dynamic circuit breaker warnings** — every query prompt is injected with which tools currently have open circuit breakers. The model is told not to call them and to offer alternatives. This closes the loop between infrastructure state and model behavior — the LLM knows what's broken at runtime.
- **Synthesis grounding** — the knowledge-agent's Haiku prompt says: answer only from the provided context, cite which document each fact comes from, say "I don't know" if the answer isn't there. Three constraints in one prompt. Each one prevents a specific failure mode: hallucination, uncited claims, confident wrong answers.
- **Voice interface brevity** — queries prefixed with `[VOICE_INTERFACE]` trigger a one-sentence response constraint. The model is listening to the interface, not just the question.
- **Router few-shots** — the Haiku classifier receives labeled examples of FUNCTION_CALL vs REACT queries. "Revenue dropped 12% — should we be concerned? → REACT (query_database + query_knowledge in parallel)." Few-shots anchor classification behavior more reliably than instructions alone.

---

## The Context Engineering

Every architectural decision shapes what the LLM sees:

- **`[title | doc_type]:` prefix baked into every chunk** — the embedding encodes not just content but document identity. "Q1 Electronics target is $330K" becomes "[2026 Annual Plan | strategy]: Q1 Electronics target is $330K" — the model knows where it came from before it reads a word.
- **Chunk order restored before synthesis** — reranking sorts chunks by relevance score. But the LLM reads context better when sentences appear in the order they were written. Chunks are sorted back to document order before being passed to Haiku — so the context flows naturally, not like a cut-up newspaper.
- **Grounding prompt** — Haiku is told explicitly: answer only from the provided context, cite which document each fact comes from, say "I don't know" if the context doesn't contain the answer. This prevents hallucination without reducing answer quality.
- **Top-5 after reranking** — more context doesn't always mean better answers. Passing 10 chunks adds noise. The reranker earns its cost by letting us pass fewer, better chunks to the synthesis model.

---

## The Cost Engineering

Every architectural decision reduces token spend:

- **Haiku router** — ~70% of queries are simple. Running them on Sonnet wastes 5x cost.
- **FUNCTION_CALL pattern** — simple queries skip the ReAct loop. 2 LLM calls instead of N.
- **Prompt caching** — system prompt, tool definitions, and conversation history cached. ~90% cost reduction on cached tokens from the second call onward.
- **Tool output trimming** — tools return only what the LLM needs. No noise re-sent on every iteration.
- **Semantic cache** — identical or near-identical queries return cached answers. A compound query (SQL + RAG + synthesis) costs significant tokens. Caching it costs near zero.
- **Structured summarization** — long conversations compressed via forced tool use schema. No fidelity loss across multiple compression cycles.

---

## The Stack

```
biagent (orchestrator)
├── query_database     MCP → PostgreSQL
├── chart              native, Chart.js → S3
├── forecast_revenue   native, linear trend
├── email              native, SMTP
├── web_search         native, Tavily
└── knowledge-agent    A2A → RAG pipeline (pgvector + Cohere rerank + Haiku)
```

Interfaces: CLI, Telegram bot, Alfred (Raspberry Pi voice assistant with wake word, lip-sync, and screen display).

Observability: every LLM call traced in LangSmith via `wrapSDK` — zero agent code changes.

---

## One Line

The SQL agent tells you what happened. The knowledge agent tells you what it means. BiAgent gives you both.

---

## Interview Notes

**Chunking strategy:** "There are sexier approaches — semantic chunking embeds every sentence and splits where meaning changes, LLM-based chunking uses a model to decide boundaries. But my documents are structured markdown with clear section headers. Document-aware + recursive hybrid is the right call: split on `##` and `###` first, each section becomes a chunk candidate, the heading becomes free metadata. If a section is too large, recurse with standard separators inside it. Deterministic, cheap, and the metadata is more precise than anything a model would infer."

**Knowledge base design:** "Six documents covering two years of company history. Annual plans give targets. Year-end reviews give actuals and decisions. Board meeting notes give the reasoning. Pricing policy answers operational questions. EMEA analysis covers the strategic bet. Each document type enables a different query pattern — and none of them are answerable from SQL alone."

**Why knowledge-agent is a separate process:** "The retrieval pipeline is complex enough to own its own context window. BiAgent sends a question over HTTP and gets back one clean answer and a list of sources. It never sees raw chunks. The orchestrator's context stays clean — this is the point of A2A."

**Index time vs query time cost tradeoff:** "The metadata extraction strategy is deliberately asymmetric — LLM at index time, heuristics at query time. Index time is a background job that runs once per document, latency doesn't matter. Query time is on the critical path, the user is waiting. Adding an LLM call just to decide which doc_type filter to apply would add ~500ms and cost money on every request. Regex is instant and free. The principle: be expensive at index time, be cheap at query time."

| Phase | Metadata approach | Why |
|-------|------------------|-----|
| Index time | LLM (gpt-4o-mini) | Offline, runs once per doc, latency doesn't matter |
| Query time | Heuristics (regex) | Live, user is waiting — every ms counts |

**LLM metadata extraction cost:** "Ingestion is an offline, low-frequency process — internal docs come in maybe a handful per week. Using Haiku to extract `{title, doc_type, year}` from each document costs roughly $0.001 per doc. At 100 docs/month that's $0.10. Not a consideration. The tradeoff is different if you're ingesting thousands of support tickets per day — then you frontmatter-tag at the source or parse filenames."

**Structured output for metadata extraction:** "When you ask an LLM to return structured data, you enforce it with a schema — either JSON mode or tool/function calling with a strict definition. Without it the model might return `doc_type: 'annual strategy'` instead of `'strategy'`, or a year as a string instead of an integer. Pass a tool definition with an enum for `doc_type` and force the model to call it via `tool_choice`. Validate the output with Zod. If it fails, log and skip — don't insert garbage metadata."
