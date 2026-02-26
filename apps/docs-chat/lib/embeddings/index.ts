import { LocalHashEmbedder } from "./local";
import type { Embedder } from "./types";
import { VoyageEmbedder } from "./voyage";

export type { Embedder, EmbedKind } from "./types";

export function getEmbedder(): Embedder {
  const provider = process.env.EMBEDDINGS_PROVIDER ?? "local";
  switch (provider) {
    case "local":
      return new LocalHashEmbedder();
    case "voyage": {
      const key = process.env.VOYAGE_API_KEY;
      if (!key) throw new Error("EMBEDDINGS_PROVIDER=voyage needs VOYAGE_API_KEY");
      return new VoyageEmbedder(key, process.env.VOYAGE_MODEL ?? "voyage-3.5");
    }
    default:
      throw new Error(`unknown EMBEDDINGS_PROVIDER "${provider}" (expected local or voyage)`);
  }
}
