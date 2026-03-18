# BiAgent — Context Engineering & Cost Optimization

A complete inventory of every context engineering decision in BiAgent, why it was made, and what it saves.

---

## 1. Prompt Caching (3/4 slots)

**What:** Three `cache_control: ephemeral` boundaries placed on the system prompt, tool definitions, and conversation history tail.

**Why:** Claude charges full price on cache misses but ~10% on cache hits. These three sections are stable across iterations — paying full price on every LLM call inside the ReAct loop would multiply costs by the iteration count.

**Tradeoff:** Cache invalidates if content changes. Slots must be stable. Any dynamic content (date, CB state) is injected into the user message, not the system prompt, to preserve cache stability.

---

## 2. Query Router — Two-Dimensional Routing

**What:** A Haiku call before the main agent loop classifies the query on two dimensions:
- **Model**: Haiku (simple) or Sonnet (complex)
- **Pattern**: DIRECT (single pass) or REACT (iterative loop)

**Why:** ~70% of BI queries are simple — single tool, obvious answer. Running them through Sonnet in a full ReAct loop wastes 5-10x the tokens and cost. The router pays for itself on the second query.

**Tradeoff:** The router itself is a Haiku call. It only wins if classification accuracy is high enough that the savings outweigh the overhead.

---

## 3. Availability Routing in the Router

**What:** Open circuit breakers are passed to the router. If the query cannot be answered with available tools, the router returns a user-facing explanation directly — no further LLM calls.

**Why:** Without this, an unavailable tool causes: router call → agent loop → broken tool call → error → reasoning around it → final answer. That's 3-4 wasted LLM calls. The router short-circuits to zero additional calls.

**Tradeoff:** The router must reason about tool topology. A wrong availability judgement silently fails the user.

---

## 4. DIRECT Execution Pattern

**What:** Simple queries skip the ReAct loop entirely. Flow: one LLM call → execute tool → one LLM call for final answer. Context never accumulates.

**Why:** The ReAct loop grows context on every iteration. For a single-tool query, that growth is pure overhead. DIRECT keeps the context window flat.

**Tradeoff:** No recovery path if the tool fails mid-execution. Handled upstream by the availability router.

---

## 5. Structured Context Summarization

**What:** When conversation history exceeds 170k tokens, Haiku compresses it via forced tool use into a `StructuredSummary`:
```
topic, key_facts[], resolved_entities{}, queries_run[], open_questions[]
```

**Why:** Free-form prose summaries are token-inefficient and degrade across multiple compression cycles (summarizing a summary loses fidelity). Forced tool use guarantees the schema — no JSON parsing, no validation, no hallucinated structure.

**Tradeoff:** Adds a Haiku call at compression time. Pays back across all subsequent iterations that carry a denser, more stable context block.

---

## 6. Selective Context Injection

**What:** `formatSummaryForContext(summary, query)` injects only the summary fields relevant to the current query. A revenue question gets `key_facts` and `queries_run`. An entity-specific question gets `resolved_entities`. Empty fields are never injected.

**Why:** Injecting the full summary every time carries irrelevant context on every iteration. Selective injection keeps the injected block minimal and focused.

**Tradeoff:** Heuristic-based (keyword matching). Breaks on queries like "same as before but Q3" where intent doesn't match keywords. Semantic injection (embedding similarity) would be more robust but adds API call cost.

---

## 7. Tool Batching

**What:** The system prompt explicitly guides Claude to call independent tools in the same iteration. Parallel: `query_database + web_search`, `query_database + query_observability`. Sequential only when data dependency exists.

**Why:** N tools in 1 iteration = 2 messages added to history. N tools across N iterations = 2N messages. Every message in history is re-sent on every subsequent LLM call — batching directly reduces context growth.

**Tradeoff:** Cannot be forced — Claude decides. Prompt guidance nudges but doesn't guarantee batching behavior.

---

## 8. Circuit Breaker State Injection

**What:** Open circuit breakers are injected into the user message before the first iteration. Claude reasons around unavailable tools rather than attempting to call them.

**Why:** Without injection, a broken tool costs 2 iterations: one to attempt the call and get an error, one to reason around it. With injection, Claude plans around it from iteration 1.

**Tradeoff:** The CB state is in the user message (not system prompt) to avoid cache invalidation. This means it's re-sent on every iteration — a small fixed cost.

---

## 9. Current Date Injection

**What:** `[Today: YYYY-MM-DD]` prepended to every user message.

**Why:** Claude has no clock. Without grounding, time-relative queries ("this week", "last month") require an extra DB call for `NOW()` or produce incorrect SQL. Date injection eliminates that failure mode at ~5 tokens per call.

**Tradeoff:** None meaningful. Pure win.

---

## 10. System Prompt Structure

**What:** System prompt organized into discrete sections with no redundancy. Tool descriptions removed (they live in the formal tool definitions passed to the API). Prose minimized to behavioral rules only.

**Why:** The system prompt is in cache slot 1. Every token costs on cache miss. Duplicate content (tool descriptions that already exist in the API call) wastes tokens with zero signal gain.

**Tradeoff:** Requires discipline — easy to re-add redundant content when extending the prompt.

---

## Summary Table

| Optimization | Mechanism | Primary Saving |
|---|---|---|
| Prompt caching | `cache_control` boundaries | ~90% cost reduction on cached tokens |
| Query router | Haiku pre-classification | Haiku vs Sonnet, ~5x model cost difference |
| Availability routing | Router returns response directly | Eliminates 3-4 wasted LLM calls |
| DIRECT pattern | Skip ReAct loop | Flat context, 2 calls vs N calls |
| Structured summarization | Forced tool use schema | Denser compression, stable re-summarization |
| Selective injection | Per-query field filtering | Fewer irrelevant tokens per iteration |
| Tool batching | Prompt guidance | Reduces history growth per task |
| CB state injection | Pre-iteration warning | Saves 2 iterations per broken tool call |
| Date injection | User message prefix | Eliminates DB round-trip for time queries |
| System prompt structure | No redundancy, no tool descriptions | Fewer cached tokens to maintain |
