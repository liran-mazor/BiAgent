# BiAgent — The Pitch

---

I built an agentic system for business teams. It started simple — 'what was last quarter's revenue?' — pure SQL, one tool call, done. But the interesting questions are different: 'did we hit our targets?' or 'should we be concerned about this drop?' — those need context that lives in documents, not the database. So I added a RAG pipeline. And since retrieval is a heavy enough process to deserve its own context window, I pulled it into a separate agent and connected them over HTTP — which gave me a natural opportunity to implement A2A.

Every query enters the same pipeline regardless of interface — CLI, Telegram bot, or Alfred (a Raspberry Pi voice assistant). Before a single expensive token is spent, the query goes through a Haiku router that makes two decisions: are the required tools available, and which execution pattern to run. If a circuit breaker is open it returns immediately — zero further LLM calls. Otherwise it picks FUNCTION_CALL or REACT, which also determines the model: Haiku for simple queries, Sonnet for complex ones.

Three things make the router worth talking about. First, forced tool use — it doesn't return free text, it's constrained to call a `route_query` tool with a strict schema. Second, few-shot examples — the prompt includes labeled examples anchoring classification at the boundary cases, including N+1 query patterns to steer the model toward JOINs. Third, infrastructure state in the prompt — open circuit breakers are injected on every call so the model knows what's broken before it decides what to run.

If I had the infrastructure budget, the router is the first thing I'd move to a local Llama. It's a binary classification task with a strict output schema — no reasoning required. A local model makes it free and removes the external dependency entirely.

---

"Does Q1 2026 match expectations?" · "Why is January revenue slow?" · "What's the plan for Books this year?" |
 "Was 2025 a good year?" · "Did Sports hit its target?" · "What changed vs the plan?" |
"What did the board decide mid-year?" · "Was there a course correction in 2025?" |
"Can we do 25% off Sports this weekend?" · "What's the margin floor on Electronics?" |
 "What did we decide about EMEA?" · "When does the UK pilot launch?" |
"What was the original plan for Sports?" · "What did we commit to the board for 2025?" |

---

## The Prompt Engineering

- **Tool batching** — the system prompt tells the model to call independent tools in the same iteration. Without this, the model defaults to sequential calls and doubles the latency.
- **Synthesis grounding** — the knowledge-agent's prompt: answer only from the provided context, cite which document each fact comes from, say "I don't know" if the answer isn't there. Three constraints, each preventing a specific failure mode: hallucination, uncited claims, confident wrong answers.
- **Voice interface brevity** — queries prefixed with `[VOICE_INTERFACE]` trigger a one-sentence response constraint. The model is listening to the interface, not just the question.

---

## The Context Engineering

- **`[title | doc_type]:` prefix baked into every chunk** — the embedding encodes not just content but document identity. "Q1 Electronics target is $330K" becomes "[2026 Annual Plan | strategy]: Q1 Electronics target is $330K" — the model knows where it came from before it reads a word.
- **Chunk order restored before synthesis** — reranking sorts by relevance score. Chunks are sorted back to document order before synthesis — so the context flows naturally, not like a cut-up newspaper.
- **Top-5 after reranking** — more context doesn't always mean better answers. The reranker earns its cost by letting us pass fewer, better chunks to the synthesis model.

---

## The Cost Engineering

- **Prompt caching** — system prompt, tool definitions, and conversation history cached. ~90% cost reduction on cached tokens from the second call onward.
- **Tool output trimming** — tools return only what the LLM needs. No noise re-sent on every iteration.
- **Semantic cache** — identical or near-identical queries return cached answers. A compound query (SQL + RAG + synthesis) costs significant tokens. Caching it costs near zero.
- **Structured summarization** — long conversations compressed via forced tool use schema. No fidelity loss across multiple compression cycles.


---

## What's Next

**Persona-driven memory.** A persistent `user_memory` table keyed by user ID. On first interaction the user declares their role — finance, analyst, executive. That persona is injected into every subsequent session and the summarizer adapts: an analyst gets aggressive compression and a tight context window; a finance manager tracking a multi-week planning thread gets a generous one. One DB row per user, one Haiku write on session start, zero ongoing cost.

---

## Interview Notes

**Chunking strategy:** "There are sexier approaches — semantic chunking, LLM-based boundary detection. But my documents are structured markdown with clear section headers. Split on `##` and `###` first, each section becomes a chunk candidate, the heading becomes free metadata. If a section is too large, recurse with standard separators. Deterministic, cheap, and the metadata is more precise than anything a model would infer."

**Index time vs query time:**

| Phase | Approach | Why |
|-------|----------|-----|
| Index time | LLM (gpt-4o-mini) | Offline, runs once per doc — latency doesn't matter |
| Query time | Agent card enum schema | Claude passes filters explicitly — zero extra latency, no regex to maintain |

The first version used server-side regex to infer `doc_type` and `year` from the question. The problem: the server only sees the current question. Claude sees the entire conversation. Pushing the filter decision to the caller via an enum schema in the agent card means Claude resolves it with full context. No inference, no regex maintenance, better accuracy.

**LLM metadata extraction cost:** "Ingestion is offline and low-frequency — a handful of docs per week. Extracting `{title, doc_type, year}` with gpt-4o-mini costs ~$0.001 per doc. At 100 docs/month that's $0.10. The tradeoff flips if you're ingesting thousands of support tickets per day — then you frontmatter-tag at the source or parse filenames."

**Structured output for metadata extraction:** "Enforce structure with a tool definition and `tool_choice: required`. Without it the model might return `doc_type: 'annual strategy'` instead of `'strategy'`. Validate with Zod. If it fails, log and skip — don't insert garbage metadata."
