# RAG Stack — Learn Before You Build

A complete mental model of every layer in a production RAG pipeline.
Read this before touching code.

---

## What RAG Actually Is

LLMs know what they were trained on. They don't know your internal documents, your board decks, your pricing policy. RAG solves this by retrieving relevant text at query time and injecting it into the prompt as context.

The model doesn't "learn" anything. It reads. The quality of the answer depends entirely on the quality of what you retrieve.

---

## The Pipeline (in order)

```
Document → Chunk → Embed → Store
                                   ↓
Query → Embed → Search → Rerank → Synthesize → Answer
```

Each step has decisions. Bad decisions at any step compound into bad answers.

---

## Step 1 — Ingestion & Text Extraction

Before you can chunk, you need clean text.

- **PDF**: use `pdf-parse` or `pdfplumber` (Python). PDFs are hell — columns, headers, footers, tables. Expect noise.
- **Markdown / plain text**: trivial, clean.
- **Word docs**: `mammoth` library. Tables survive better than PDF.

**What to preserve:** document title, source, date, author, section headers. These become metadata for filtering later.

**What to strip:** page numbers, repeated headers/footers, boilerplate legal text.

---

## Step 2 — Chunking

This is where most RAG systems fail. Too large = noisy retrieval. Too small = missing context.

### Strategies

**Fixed-size chunking** — split every N tokens with M token overlap.
- Simple, predictable.
- Problem: splits sentences mid-thought.
- Use when: homogeneous text (logs, transcripts).

**Recursive character splitting** — split on `\n\n`, then `\n`, then `. `, then ` `. Respects natural text boundaries.
- Better than fixed-size for prose.
- This is the default in LangChain's `RecursiveCharacterTextSplitter`.
- Use when: general documents, meeting notes, strategy docs.

**Semantic chunking** — embed sentences, split where cosine similarity drops below a threshold.
- Keeps semantically coherent ideas together.
- More expensive (requires embedding every sentence).
- Use when: quality matters more than cost (board decks, policy docs).

**Document-aware chunking** — split on headers (`#`, `##`), preserve section structure.
- Best for markdown, wikis, structured reports.
- Each chunk inherits its section heading as metadata.

### The overlap question

Overlap (e.g., 10-20% of chunk size) ensures that information at chunk boundaries isn't lost. A sentence split between chunk 4 and chunk 5 will appear in both — so retrieval finds it regardless of which chunk scores higher.

### Practical numbers to start with
- Chunk size: **512 tokens**
- Overlap: **50-100 tokens**
- Adjust based on your documents. If answers feel incomplete, increase chunk size. If they feel noisy, decrease it.

---

## Step 3 — Embedding

An embedding turns text into a vector (array of numbers) that encodes semantic meaning. Similar meaning = vectors close together in space.

### Model choices

| Model | Dimensions | Cost | Notes |
|-------|-----------|------|-------|
| `text-embedding-3-small` | 1536 | $0.02/1M tokens | Best price/quality for most use cases |
| `text-embedding-3-large` | 3072 | $0.13/1M tokens | Marginal improvement, 6x cost |
| `nomic-embed-text` | 768 | Free (local) | Open source, surprisingly good |

**Start with `text-embedding-3-small`.** You can always re-embed with a better model later — it's just a batch job.

### What you're embedding

- At **index time**: embed every chunk → store vector in pgvector
- At **query time**: embed the user's question → search for nearest chunks

The embedding model must be the same for both. Mixing models produces garbage results.

---

## Step 4 — Vector Storage & Indexing

You already have `pgvector` in PostgreSQL. This is the right call for your scale.

### The table structure
```sql
CREATE TABLE documents (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content     text,                    -- the raw chunk text
  embedding   vector(1536),            -- the embedded vector
  source      text,                    -- filename or doc title
  doc_type    text,                    -- 'strategy', 'policy', 'board_deck', etc.
  created_at  timestamptz DEFAULT now()
);
```

### The index

Without an index, pgvector does an exact scan (slow at scale). With an index, it does approximate nearest neighbor (fast, slightly less precise).

```sql
CREATE INDEX ON documents USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
```

**HNSW** (Hierarchical Navigable Small World) — the right index for most use cases. Builds a graph of vectors, navigates it like a map. Fast queries, good recall.

**IVFFlat** — alternative. Faster to build, slower to query. Use for very large datasets (millions of vectors). You won't need this.

### The query

```sql
SELECT content, source, 1 - (embedding <=> $1) AS similarity
FROM documents
WHERE doc_type = 'strategy'         -- metadata pre-filter
ORDER BY embedding <=> $1           -- cosine distance
LIMIT 20;                           -- retrieve top-K candidates for reranking
```

The `<=>` operator is cosine distance. `1 - distance = similarity`.

---

## Step 5 — Retrieval

You have a query vector. You search for the K most similar chunks. But "most similar" by cosine distance is not the same as "most useful for answering the question."

### Top-K selection

Retrieve more than you need — typically 20 candidates — then rerank to the final 5-10. The extra candidates are cheap (vector search is fast). The reranker picks the best ones.

### Metadata filtering

Filter before vector search, not after. If the user asks about pricing policy, restrict the search to `doc_type = 'policy'`. This is both more accurate and faster.

Where does the filter come from? Either:
- The knowledge-agent's LLM infers it from the question
- You pass it explicitly from BiAgent

---

## Step 6 — Reranking (the quality multiplier)

This is the step most RAG tutorials skip. It's also the step that most improves answer quality.

**The problem with vector search alone:** cosine similarity measures "is this chunk topically related?" not "does this chunk actually answer the question?" A chunk about revenue forecasting might score high for "what are our Q4 targets?" even if it doesn't contain the actual target numbers.

**What a reranker does:** takes your top-K candidates and the original question, and scores each candidate on "how well does this passage answer this specific question?"

### TL;DR — bi-encoder vs cross-encoder

**Bi-encoder** (what we use for retrieval): query and document are embedded separately into vectors, then compared with cosine similarity. Fast — the document vectors are precomputed and stored. This is why vector search scales.

**Cross-encoder** (what Cohere rerank uses): query and document are fed together into the model in a single forward pass. The model reads them jointly and outputs a relevance score. Much slower — can't precompute, must run at query time per candidate. But far more accurate because the model sees both simultaneously and can detect subtle interactions.

### How it works under the hood

Embedding-based retrieval (step 5) is a **bi-encoder**: query and passage are embedded *separately*, then compared by cosine distance. Fast, but the model never sees them together — it can't judge how well the passage answers *this specific question*.

A reranker is a **cross-encoder**: the query and passage are concatenated into a single input and fed through the model together.

```
Input:  [CLS] what are our Q4 targets? [SEP] Electronics revenue target for Q4 is $172K [SEP]
Output: 0.94  ← relevance score
```

The model reads both at the same time. It can attend across the query and the passage — catching things like "Q4" matching "Q4", "targets" matching "revenue target", "$172K" being a specific number. The output is a single relevance score, not a vector.

**Why you can't do this at retrieval time:** cross-encoding is ~100x slower than bi-encoding. You can't cross-encode every chunk in the database against every query. You use the fast bi-encoder to get 10-20 candidates, then the slow cross-encoder to pick the best 3-5.

**Why it's Deep Learning, not classical ML:**
- Classical ML would use hand-crafted features: keyword overlap, TF-IDF score, BM25, document length
- A cross-encoder learned what "relevance" means from millions of `(query, passage, score)` examples — it understands paraphrase, implication, negation
- You can't replicate that with rules or statistics

### All alternatives compared

| Approach | How it works | Quality | Cost | Notes |
|----------|-------------|---------|------|-------|
| **Cross-encoder (Cohere, MiniLM)** | DL model reads query+passage together | Best | $1/1k calls | The right default |
| **LLM reranking** | Ask Haiku "which passage best answers this?" | Good | ~$0.01/query | No extra dependency, slower |
| **BM25 (classical ML)** | Keyword frequency + inverse doc frequency | Okay | Free | No semantic understanding, misses paraphrase |
| **TF-IDF** | Term frequency scoring | Poor | Free | Purely lexical — "Q4 targets" won't match "fourth quarter objectives" |
| **Regex / rules** | Pattern match on keywords | Poor | Free | Only works for exact phrasing, brittle |
| **Re-embedding with better model** | Re-embed with larger model, re-score | Okay | Medium | Still bi-encoder — fundamentally limited |

**The key insight:** anything lexical (BM25, TF-IDF, regex) fails on paraphrase. "What did the board approve?" won't match "The directors greenlit the EMEA expansion." A cross-encoder handles this because it was trained on natural language understanding, not keyword counting.

### Practical flow
```
vector search → top 10 candidates
reranker       → score each against the query
take top 5     → pass to synthesis LLM
```

### Options for our project

**Cohere Rerank API** — easiest, best quality. Send query + passages, get relevance scores back. $1/1000 calls.

**`cross-encoder/ms-marco-MiniLM-L-6-v2`** — open source, run locally via Hugging Face. Free but requires Python or a local inference server.

**LLM-based reranking** — ask Haiku to score or rank passages. More expensive but no extra dependency. Good fallback if Cohere is unavailable.

We use Cohere.

---

## Step 7 — Synthesis

You have 5 relevant chunks. Now you ask the LLM to answer the question using only those chunks.

```
System: You are a business knowledge assistant. Answer the question using
        only the provided context. If the answer isn't in the context, say so.

User:   Context:
        [chunk 1]
        [chunk 2]
        ...

        Question: What were the assumptions behind last quarter's forecast?
```

**Key prompt decisions:**
- Tell the model to cite which document each fact came from
- Tell it to say "I don't know" if the context doesn't contain the answer — this prevents hallucination
- Keep chunk count low (5 is usually right) — more context doesn't always mean better answers

---

## The Failure Modes to Know

| Failure | Cause | Fix |
|---------|-------|-----|
| "I don't know" when answer exists | Bad chunking — answer split across chunk boundary | Increase overlap |
| Wrong answer confidently stated | Retrieved wrong chunks | Add reranker |
| Answer too vague | Chunk size too small | Increase chunk size |
| Slow retrieval | No HNSW index | Add index |
| Good retrieval, bad synthesis | Too many chunks passed to LLM | Reduce top-K after rerank |
| Stale answers | No re-indexing pipeline | Add doc updated_at + re-embed on change |

---

## What Makes This Different from Web Search

Web search retrieves documents. RAG retrieves *passages* and synthesizes an answer. The user gets one clean answer, not 10 links.

The knowledge-agent in BiAgent will return `{ answer: string, sources: string[] }`. BiAgent never sees the chunks. The LLM never sees more than 5 passages. The user gets a direct answer grounded in their own internal documents.

---

## pgvector SQL Syntax — The Essentials

This syntax looks unfamiliar the first time. Here's what each piece means.

### The distance operator `<=>`

```sql
ORDER BY embedding <=> $1::vector
```

`<=>` is the **cosine distance** operator added by pgvector. It takes two vectors and returns a number between 0 and 2:
- `0` = identical vectors (same meaning)
- `1` = orthogonal (unrelated)
- `2` = opposite

It's not standard SQL — pgvector registers it as a custom operator. `ORDER BY embedding <=> $1` means "sort rows by how close their embedding is to the query vector." Closest first = most relevant first.

### Flipping distance to similarity

```sql
1 - (embedding <=> $1::vector) AS similarity
```

Distance and similarity are inverses. Cosine distance `0` means identical, but a similarity score of `0` would mean "no match" — confusing for humans. Subtracting from 1 flips it:
- Distance `0.0` → similarity `1.0` (perfect match)
- Distance `0.3` → similarity `0.7`
- Distance `1.0` → similarity `0.0`

The `ORDER BY` still uses raw distance (not `1 - ...`) because lower distance = better match, which is what `ASC` ordering wants.

### The `::vector` cast

```sql
$2::vector
```

`$2` is a plain string parameter (e.g. `'[0.1, 0.2, 0.3, ...]'`). The `::vector` cast tells PostgreSQL to interpret that string as a pgvector type. Without it, PostgreSQL doesn't know it's a vector and the `<=>` operator won't work.

### Optional filter with NULL

```sql
WHERE ($2::text IS NULL OR doc_type = $2)
  AND ($3::int  IS NULL OR year     = $3)
```

This is the standard SQL pattern for **optional filters**. The logic is:
- If you pass `null` for `$2` → `null IS NULL` is `true` → the whole condition is `true` → no filter applied
- If you pass `'policy'` for `$2` → `'policy' IS NULL` is `false` → falls through to `doc_type = 'policy'`

One query handles both "filter by doc_type" and "search everything" without needing to build dynamic SQL strings. The same pattern works for any optional filter.

### Putting it together

```sql
SELECT
  content,
  source,
  doc_type,
  year,
  chunk_index,
  1 - (embedding <=> $1::vector) AS similarity   -- flip distance → similarity score
FROM documents
WHERE ($2::text IS NULL OR doc_type = $2)         -- optional doc_type filter
  AND ($3::int  IS NULL OR year     = $3)         -- optional year filter
ORDER BY embedding <=> $1::vector                 -- closest vector first
LIMIT $4;                                         -- top-K candidates
```

Parameters: `[$1 = query vector, $2 = doc_type or null, $3 = year or null, $4 = K]`

---

## What to Build (in order)

1. Schema + HNSW index in PostgreSQL
2. Ingestion script: PDF/markdown → chunks → embeddings → pgvector
3. Retrieval function: embed query → vector search → metadata filter
4. Reranker: Cohere API call on top-K results
5. Synthesis: Haiku over top-5 chunks
6. Express server: wrap as A2A agent
7. Register in BiAgent's `a2aServers.ts`

Each step is testable independently. Build and verify one step before adding the next.
