# RAG Stack — Gaps to Review

## pgvector

**Why the embedding model must be the same at index and query time**
Not just about dimensions — different models produce incompatible vector spaces. Even if dimensions match, similarity scores between vectors from different models are meaningless.

**`1 - (embedding <=> $1)` and why ORDER BY doesn't use it**
`<=>` is cosine distance (0 = identical, 2 = opposite). `1 - distance` flips it to similarity for human readability. ORDER BY keeps raw distance because lower = better fits ASC naturally, and using the expression in ORDER BY breaks index usage.

**HNSW vs IVFFlat**
HNSW: faster queries, slower to build — right default.
IVFFlat: faster to build, slower to query — use only at millions of vectors where build time matters more than query latency.

---

## RAG

**BM25 vs cosine similarity on paraphrase**
BM25 is keyword-only — "directors greenlit" won't match "board approved". Cosine similarity is semantic — it handles paraphrase. Know which retrieval method fails on which input type.

**"I don't know" when the answer exists — #1 cause**
Not the HNSW index. The answer is sitting on a chunk boundary with too little overlap — it appears in neither chunk completely, so retrieval misses it. Fix: increase overlap.

**What "I don't know" in the synthesis prompt prevents**
Hallucination — the model generating a confident answer from training data when the retrieved context doesn't contain it.

**Why a high cosine similarity score doesn't mean a useful chunk**
A chunk about revenue forecasting *methodology* scores high for "what are our Q4 targets?" because it's topically related. But it doesn't contain the actual number. Cosine measures topical overlap, not answer quality. This is exactly what a reranker fixes.
