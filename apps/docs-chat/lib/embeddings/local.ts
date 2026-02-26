import type { EmbedKind, Embedder } from "./types";

const STOPWORDS = new Set(
  "a an and are as at be but by can do does for from how i if in into is it its of on or so that the this to was we what when where which who why will with you your".split(
    " ",
  ),
);

export function tokenize(text: string): string[] {
  return text
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

function fnv1a(s: string, seed = 0x811c9dc5): number {
  let h = seed;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// Feature hashing over unigrams + bigrams. No model, no network, deterministic.
// It's basically keyword search in vector form: fine when the question uses
// the same words as the docs, useless for paraphrases. Good enough to develop
// the rest of the pipeline without paying for embeddings on every re-ingest.
export class LocalHashEmbedder implements Embedder {
  readonly name: string;

  constructor(readonly dims = 1024) {
    this.name = `local-hash-${dims}`;
  }

  async embed(texts: string[], _kind: EmbedKind): Promise<Float32Array[]> {
    return texts.map((t) => this.embedOne(t));
  }

  embedOne(text: string): Float32Array {
    const vec = new Float32Array(this.dims);
    const tokens = tokenize(text);
    const counts = new Map<string, number>();
    const add = (f: string) => counts.set(f, (counts.get(f) ?? 0) + 1);

    for (let i = 0; i < tokens.length; i++) {
      add(tokens[i]!);
      if (i > 0) add(`${tokens[i - 1]}_${tokens[i]}`);
    }

    for (const [feature, tf] of counts) {
      const h = fnv1a(feature);
      const sign = fnv1a(feature, 0x9747b28c) & 1 ? 1 : -1;
      vec[h % this.dims]! += sign * (1 + Math.log(tf));
    }

    let norm = 0;
    for (const v of vec) norm += v * v;
    norm = Math.sqrt(norm);
    if (norm > 0) for (let i = 0; i < vec.length; i++) vec[i]! /= norm;
    return vec;
  }
}
