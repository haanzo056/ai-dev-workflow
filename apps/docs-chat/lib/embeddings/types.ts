export type EmbedKind = "document" | "query";

export interface Embedder {
  // stored in the index; a query embedded with a different embedder than the
  // index is garbage, so retrieval refuses to run on a mismatch
  readonly name: string;
  readonly dims: number;
  embed(texts: string[], kind: EmbedKind): Promise<Float32Array[]>;
}
