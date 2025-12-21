import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { planChunks } from "../src/chunk.js";
import { parseUnifiedDiff } from "../src/diff.js";
import { nearestLine, parseFindings } from "../src/parse.js";
import { rankFindings } from "../src/pipeline.js";
import type { Finding } from "../src/types.js";

const fixture = readFileSync(new URL("./fixtures/small.diff", import.meta.url), "utf8");
const chunk = planChunks(parseUnifiedDiff(fixture), { maxTokensPerChunk: 10_000 }).chunks[0]!;
const opts = { minConfidence: 0.6, includeNits: false };

const finding = (over: Partial<Finding> = {}): Finding => ({
  path: "src/hooks/useDebounce.ts",
  line: 9,
  severity: "bug",
  title: "Timeout is never cleared",
  body: "The cleanup function was removed, so stale updates fire after unmount.",
  confidence: 0.9,
  ...over,
});

describe("parseFindings", () => {
  it("accepts a valid finding", () => {
    const r = parseFindings({ summary: "s", findings: [finding()] }, chunk, opts);
    expect(r.findings).toHaveLength(1);
    expect(r.dropped).toHaveLength(0);
    expect(r.summary).toBe("s");
  });

  it("rejects input that isn't the tool shape", () => {
    const r = parseFindings("not json", chunk, opts);
    expect(r.findings).toEqual([]);
    expect(r.dropped[0]!.reason).toBe("invalid tool input");
  });

  it("drops findings for files outside the chunk", () => {
    const r = parseFindings({ summary: "", findings: [finding({ path: "src/nope.ts" })] }, chunk, opts);
    expect(r.dropped[0]!.reason).toMatch(/path not in chunk/);
  });

  it("normalizes a/ and ./ prefixes", () => {
    const r = parseFindings(
      { summary: "", findings: [finding({ path: "a/src/api/users.ts", line: 2 }), finding({ path: "./src/api/users.ts", line: 3 })] },
      chunk,
      opts,
    );
    expect(r.findings.map((f) => f.path)).toEqual(["src/api/users.ts", "src/api/users.ts"]);
  });

  it("filters nits and low confidence", () => {
    const r = parseFindings(
      { summary: "", findings: [finding({ severity: "nit" }), finding({ confidence: 0.3 })] },
      chunk,
      opts,
    );
    expect(r.findings).toHaveLength(0);
    expect(r.dropped.map((d) => d.reason)).toEqual(["nit", "low confidence (0.3)"]);

    const withNits = parseFindings({ summary: "", findings: [finding({ severity: "nit" })] }, chunk, {
      ...opts,
      includeNits: true,
    });
    expect(withNits.findings).toHaveLength(1);
  });

  it("snaps slightly-off lines onto the diff and drops far ones", () => {
    const r = parseFindings(
      {
        summary: "",
        findings: [finding({ path: "src/api/users.ts", line: 8 }), finding({ path: "src/api/users.ts", line: 40 })],
      },
      chunk,
      opts,
    );
    expect(r.findings.map((f) => f.line)).toEqual([6]);
    expect(r.dropped[0]!.reason).toBe("line 40 not in diff");
  });

  it("drops findings with a bad schema but keeps the rest", () => {
    const r = parseFindings(
      { summary: "", findings: [{ path: "x", line: "12" }, finding({ severity: "risk" })] },
      chunk,
      opts,
    );
    expect(r.findings).toHaveLength(1);
    expect(r.dropped[0]!.reason).toBe("schema");
  });
});

describe("nearestLine", () => {
  it("prefers the line above on ties", () => {
    expect(nearestLine(new Set([4, 6]), 5, 3)).toBe(4);
  });
});

describe("rankFindings", () => {
  it("dedupes by location keeping the most severe, then sorts and caps", () => {
    const out = rankFindings(
      [
        finding({ severity: "suggestion", line: 7 }),
        finding({ severity: "bug", line: 7 }),
        finding({ severity: "risk", line: 8, confidence: 0.7 }),
        finding({ severity: "risk", line: 9, confidence: 0.95 }),
        finding({ severity: "suggestion", line: 14 }),
      ],
      3,
    );
    expect(out.map((f) => [f.line, f.severity])).toEqual([
      [7, "bug"],
      [9, "risk"],
      [8, "risk"],
    ]);
  });
});
