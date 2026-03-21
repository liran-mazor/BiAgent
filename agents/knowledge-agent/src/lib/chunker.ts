/**
 * Pure chunking logic — no CLI, no side effects.
 * Imported by both scripts/chunk.ts (CLI) and scripts/ingest.ts (ingestion).
 */

// ~500 tokens. 1 token ≈ 4 chars → 2000 chars.
export const CHUNK_SIZE = 2000;
// ~100 tokens overlap → 400 chars.
export const CHUNK_OVERLAP = 400;

const SEPARATORS = ['\n\n', '\n', '. ', ' '];

export interface Chunk {
  text: string;        // "[title | doc_type]: " prefix + content — what gets embedded
  chunkIndex: number;  // position in document — used to re-sort chunks before synthesis
}

function splitText(text: string, separators: string[], chunkSize: number): string[] {
  const [separator, ...remaining] = separators;

  if (!separator) {
    const pieces: string[] = [];
    for (let i = 0; i < text.length; i += chunkSize) {
      pieces.push(text.slice(i, i + chunkSize));
    }
    return pieces;
  }

  const pieces = text.split(separator).filter(p => p.trim().length > 0);
  const merged: string[] = [];
  let current = '';

  for (const piece of pieces) {
    const candidate = current ? current + separator + piece : piece;
    if (candidate.length <= chunkSize) {
      current = candidate;
    } else {
      if (current) merged.push(current.trim());
      if (piece.length > chunkSize) {
        const subChunks = splitText(piece, remaining, chunkSize);
        merged.push(...subChunks.slice(0, -1));
        current = subChunks[subChunks.length - 1] ?? '';
      } else {
        current = piece;
      }
    }
  }

  if (current.trim()) merged.push(current.trim());
  return merged;
}

function addOverlap(chunks: string[], overlap: number): string[] {
  if (chunks.length <= 1) return chunks;
  return chunks.map((chunk, i) => {
    if (i === 0) return chunk;
    const prefix = chunks[i - 1].slice(-overlap).trim();
    if (chunk.startsWith(prefix)) return chunk;
    return prefix + '\n' + chunk;
  });
}

export function chunkDocument(text: string, docTitle: string, docType: string): Chunk[] {
  const prefix = `[${docTitle} | ${docType}]: `;
  const rawPieces = splitText(text, SEPARATORS, CHUNK_SIZE);
  const withOverlap = addOverlap(rawPieces, CHUNK_OVERLAP);
  return withOverlap.map((content, i) => ({
    text: prefix + content,
    chunkIndex: i,
  }));
}
