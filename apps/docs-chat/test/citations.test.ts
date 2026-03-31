import { describe, expect, it } from "vitest";
import { checkCitations, extractCitations, segmentCitations, type Source } from "../lib/citations";

const src = (n: number, path: string): Source => ({ n, path, headings: [], startLine: 1, score: 0.5 });

describe("citations", () => {
  it("extracts single, repeated and comma-separated citations", () => {
    expect(extractCitations("Use Vercel [2]. Or fly [1][2]. See [3, 4].")).toEqual([1, 2, 3, 4]);
    expect(extractCitations("no citations here, array[i] is not one")).toEqual([]);
  });

  it("flags citations that point at nothing", () => {
    const r = checkCitations("A [1]. B [3]. C [1].", [src(1, "deployment.md"), src(2, "testing.md")]);
    expect(r.cited).toEqual([1, 3]);
    expect(r.invalid).toEqual([3]);
    expect(r.citedPaths).toEqual(["deployment.md"]);
  });

  it("segments text around markers", () => {
    expect(segmentCitations("Roll back in Vercel [1][2].")).toEqual([
      { type: "text", text: "Roll back in Vercel " },
      { type: "cite", n: 1 },
      { type: "cite", n: 2 },
      { type: "text", text: "." },
    ]);
  });
});
