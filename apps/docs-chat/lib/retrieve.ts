import { getEmbedder, type Embedder } from "./embeddings";
import { loadIndex, type StoredChunk } from "./store";
import { topK } from "./vector";

export interface Retrieved {
  chunk: StoredChunk;
  score: number;
}

export interface RetrieveOptions {
  dbPath: string;
  k?: number;
  minScore?: number;
  embedder?: Embedder;
}

export async function retrieve(query: string, opts: RetrieveOptions): Promise<Retrieved[]> {
  const index = loadIndex(opts.dbPath);
  const embedder = opts.embedder ?? getEmbedder();
  if (index.meta.embedder !== embedder.name) {
    throw new Error(
      `index was built with ${index.meta.embedder} but the current embedder is ${embedder.name}; re-run ingest`,
    );
  }

  const [q] = await embedder.embed([query], "query");
  // max 3 per file: otherwise one long doc that mentions the topic a lot
  // crowds out the one short page that actually answers it
  return topK(q!, index.chunks, (c) => c.embedding, opts.k ?? 6, {
    minScore: opts.minScore ?? 0.15,
    maxPerGroup: 3,
    group: (c) => c.path,
  }).map((s) => ({ chunk: s.item, score: s.score }));
}
