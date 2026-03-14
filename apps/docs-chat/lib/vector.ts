export function cosine(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) throw new Error(`dimension mismatch: ${a.length} vs ${b.length}`);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export interface Scored<T> {
  item: T;
  score: number;
}

// Brute force. A few thousand chunks x 1024 dims is ~5ms, not worth an ANN index.
export function topK<T>(
  query: Float32Array,
  items: T[],
  vec: (item: T) => Float32Array,
  k: number,
  opts: { minScore?: number; maxPerGroup?: number; group?: (item: T) => string } = {},
): Scored<T>[] {
  const scored = items
    .map((item) => ({ item, score: cosine(query, vec(item)) }))
    .filter((s) => s.score >= (opts.minScore ?? -Infinity))
    .sort((a, b) => b.score - a.score);

  if (!opts.maxPerGroup || !opts.group) return scored.slice(0, k);

  const perGroup = new Map<string, number>();
  const out: Scored<T>[] = [];
  for (const s of scored) {
    const g = opts.group(s.item);
    const n = perGroup.get(g) ?? 0;
    if (n >= opts.maxPerGroup) continue;
    perGroup.set(g, n + 1);
    out.push(s);
    if (out.length === k) break;
  }
  return out;
}
