import { describe, expect, it } from "vitest";
import { retrievalQuery } from "../lib/answer";
import { LocalHashEmbedder, tokenize } from "../lib/embeddings/local";
import { cosine, topK } from "../lib/vector";

describe("cosine", () => {
  it("is 1 for identical, 0 for orthogonal, 0 for zero vectors", () => {
    const a = Float32Array.from([1, 2, 3]);
    expect(cosine(a, a)).toBeCloseTo(1);
    expect(cosine(Float32Array.from([1, 0]), Float32Array.from([0, 1]))).toBe(0);
    expect(cosine(Float32Array.from([0, 0]), Float32Array.from([1, 1]))).toBe(0);
  });

  it("throws on dimension mismatch", () => {
    expect(() => cosine(new Float32Array(3), new Float32Array(4))).toThrow(/dimension/);
  });
});

describe("topK", () => {
  const items = [
    { id: "a1", g: "a", v: Float32Array.from([1, 0]) },
    { id: "a2", g: "a", v: Float32Array.from([0.9, 0.1]) },
    { id: "a3", g: "a", v: Float32Array.from([0.8, 0.2]) },
    { id: "b1", g: "b", v: Float32Array.from([0.5, 0.5]) },
    { id: "c1", g: "c", v: Float32Array.from([0, 1]) },
  ];
  const q = Float32Array.from([1, 0]);

  it("returns the best k", () => {
    expect(topK(q, items, (i) => i.v, 2).map((s) => s.item.id)).toEqual(["a1", "a2"]);
  });

  it("applies minScore and per-group caps", () => {
    const out = topK(q, items, (i) => i.v, 5, { minScore: 0.1, maxPerGroup: 2, group: (i) => i.g });
    expect(out.map((s) => s.item.id)).toEqual(["a1", "a2", "b1"]);
  });
});

describe("LocalHashEmbedder", () => {
  const e = new LocalHashEmbedder(512);

  it("is deterministic and normalized", () => {
    const [a, b] = [e.embedOne("roll back a deploy"), e.embedOne("roll back a deploy")];
    expect(Array.from(a)).toEqual(Array.from(b));
    expect(cosine(a, a)).toBeCloseTo(1);
  });

  it("ranks keyword overlap above unrelated text", () => {
    const q = e.embedOne("how do I roll back a production deploy");
    const related = e.embedOne("Rollback: to roll back production, promote the previous deploy in Vercel");
    const unrelated = e.embedOne("Feature flags are managed in PostHog");
    expect(cosine(q, related)).toBeGreaterThan(cosine(q, unrelated));
  });

  it("splits camelCase and drops stopwords", () => {
    expect(tokenize("How do I use getFlag in the server?")).toEqual(["use", "get", "flag", "server"]);
  });
});

describe("retrievalQuery", () => {
  it("uses the last question as is when it's specific", () => {
    expect(
      retrievalQuery([
        { role: "user", content: "how do feature flags work" },
        { role: "assistant", content: "..." },
        { role: "user", content: "what is the rate limit on public endpoints per minute" },
      ]),
    ).toBe("what is the rate limit on public endpoints per minute");
  });

  it("glues the previous question onto short follow-ups", () => {
    expect(
      retrievalQuery([
        { role: "user", content: "how do I roll back the web app" },
        { role: "assistant", content: "..." },
        { role: "user", content: "and the worker?" },
      ]),
    ).toBe("how do I roll back the web app\nand the worker?");
  });
});
