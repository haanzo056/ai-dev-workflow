import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { planChunks } from "../src/chunk.js";
import { parseUnifiedDiff } from "../src/diff.js";
import type { FileDiff, Hunk } from "../src/types.js";

const fixture = readFileSync(new URL("./fixtures/small.diff", import.meta.url), "utf8");

function fakeFile(path: string, hunkCount: number, linesPerHunk: number): FileDiff {
  const hunks: Hunk[] = [];
  for (let h = 0; h < hunkCount; h++) {
    const start = h * 100 + 1;
    hunks.push({
      header: `@@ -${start},0 +${start},${linesPerHunk} @@`,
      oldStart: start,
      oldLines: 0,
      newStart: start,
      newLines: linesPerHunk,
      lines: Array.from({ length: linesPerHunk }, (_, i) => ({
        kind: "add" as const,
        content: `const value${i} = computeSomething(${i}, "padding padding padding");`,
        newLine: start + i,
      })),
    });
  }
  return { path, oldPath: path, status: "modified", binary: false, hunks };
}

describe("planChunks", () => {
  it("skips binary, deleted and lockfiles", () => {
    const files = parseUnifiedDiff(fixture);
    files.push({ ...fakeFile("package-lock.json", 1, 5) });
    const plan = planChunks(files, { maxTokensPerChunk: 10_000 });

    expect(plan.skipped).toEqual([
      { path: "src/old/legacy.ts", reason: "deleted" },
      { path: "public/logo.png", reason: "binary" },
      { path: "package-lock.json", reason: "ignored" },
    ]);
  });

  it("packs small files into one chunk", () => {
    const plan = planChunks(parseUnifiedDiff(fixture), { maxTokensPerChunk: 10_000 });
    expect(plan.chunks).toHaveLength(1);
    expect(plan.chunks[0]!.files.map((f) => f.path)).toEqual([
      "src/hooks/useDebounce.ts",
      "src/api/users.ts",
      "src/lib/format.ts",
    ]);
  });

  it("starts a new chunk when the next file would overflow", () => {
    const a = fakeFile("a.ts", 1, 40);
    const b = fakeFile("b.ts", 1, 40);
    const c = fakeFile("c.ts", 1, 40);
    // each file is ~900 tokens by the estimate
    const plan = planChunks([a, b, c], { maxTokensPerChunk: 2500 });
    expect(plan.chunks.map((ch) => ch.files.map((f) => f.path))).toEqual([["a.ts", "b.ts"], ["c.ts"]]);
    for (const ch of plan.chunks) expect(ch.estTokens).toBeLessThanOrEqual(2500);
  });

  it("splits one big file by hunks and marks the parts", () => {
    const big = fakeFile("big.ts", 6, 40);
    const plan = planChunks([fakeFile("small.ts", 1, 2), big, fakeFile("after.ts", 1, 2)], {
      maxTokensPerChunk: 2500,
    });

    const parts = plan.chunks.filter((c) => c.partOf?.path === "big.ts");
    expect(parts.length).toBe(3);
    expect(parts.map((p) => p.partOf!.part)).toEqual([1, 2, 3]);
    expect(parts.every((p) => p.partOf!.total === 3)).toBe(true);
    expect(parts.flatMap((p) => p.files[0]!.hunks).length).toBe(6);

    // the small file before the big one is flushed on its own, not merged into a part
    expect(plan.chunks[0]!.files.map((f) => f.path)).toEqual(["small.ts"]);
    expect(plan.chunks.at(-1)!.files.map((f) => f.path)).toEqual(["after.ts"]);
  });

  it("gives chunks stable sequential ids", () => {
    const plan = planChunks([fakeFile("a.ts", 3, 40), fakeFile("b.ts", 1, 3)], { maxTokensPerChunk: 1500 });
    expect(plan.chunks.map((c) => c.id)).toEqual(plan.chunks.map((_, i) => `c${i + 1}`));
  });
});
