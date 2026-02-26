import type { EmbedKind, Embedder } from "./types";

interface VoyageResponse {
  data: { embedding: number[]; index: number }[];
  usage?: { total_tokens: number };
}

export class VoyageEmbedder implements Embedder {
  readonly name: string;
  readonly dims: number;

  constructor(
    private apiKey: string,
    private model = "voyage-3.5",
    dims = 1024,
    private batchSize = 64,
  ) {
    this.name = `voyage:${model}:${dims}`;
    this.dims = dims;
  }

  async embed(texts: string[], kind: EmbedKind): Promise<Float32Array[]> {
    const out: Float32Array[] = [];
    for (let i = 0; i < texts.length; i += this.batchSize) {
      out.push(...(await this.batch(texts.slice(i, i + this.batchSize), kind)));
    }
    return out;
  }

  private async batch(input: string[], kind: EmbedKind, attempt = 0): Promise<Float32Array[]> {
    const res = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        input,
        model: this.model,
        // query vs document matters: voyage prepends a different instruction
        input_type: kind,
        output_dimension: this.dims,
      }),
    });

    if (res.status === 429 && attempt < 4) {
      // free tier rate limit is low; ingest of ~40 files hits it
      await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
      return this.batch(input, kind, attempt + 1);
    }
    if (!res.ok) throw new Error(`voyage ${res.status}: ${await res.text()}`);

    const json = (await res.json()) as VoyageResponse;
    return json.data.sort((a, b) => a.index - b.index).map((d) => Float32Array.from(d.embedding));
  }
}
