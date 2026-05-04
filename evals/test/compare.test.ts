import { describe, expect, it } from "vitest";
import { compareRuns, formatComparison } from "../src/compare.js";
import { formatTable, summarize } from "../src/report.js";
import type { CaseResult, RunFile } from "../src/types.js";

const result = (id: string, score: number, over: Partial<CaseResult> = {}): CaseResult => ({
  id,
  suite: "reviewer",
  checks: [{ name: "x", pass: score > 0.5 }],
  score,
  output: null,
  ms: 1200,
  ...over,
});

const run = (runId: string, results: CaseResult[], config: RunFile["config"] = { promptVersion: "v2" }): RunFile => ({
  runId,
  startedAt: "2026-01-01T00:00:00.000Z",
  gitSha: "abc123",
  suite: "reviewer",
  config,
  results,
  summary: summarize(results),
});

describe("compareRuns", () => {
  it("lines up cases by id and handles added/removed ones", () => {
    const a = run("a", [result("one", 0.5), result("two", 1), result("gone", 1)]);
    const b = run("b", [result("one", 1), result("two", 0.75), result("new", 0)]);
    expect(compareRuns(a, b)).toEqual([
      { id: "gone", before: 1, after: null, delta: null },
      { id: "new", before: null, after: 0, delta: null },
      { id: "one", before: 0.5, after: 1, delta: 0.5 },
      { id: "two", before: 1, after: 0.75, delta: -0.25 },
    ]);
  });

  it("marks changes beyond the noise threshold and shows config changes", () => {
    const a = run("a", [result("one", 0.5), result("two", 1), result("same", 0.8)]);
    const b = run("b", [result("one", 1), result("two", 0.5), result("same", 0.85)], { promptVersion: "v3" });
    const out = formatComparison(a, b);
    expect(out).toContain("promptVersion: v2 -> v3");
    expect(out).toMatch(/one\s+0\.50 -> 1\.00\s+better/);
    expect(out).toMatch(/two\s+1\.00 -> 0\.50\s+WORSE/);
    expect(out).toMatch(/same\s+0\.80 -> 0\.85\s*$/m);
  });
});

describe("report", () => {
  it("summarizes checks and judge scores", () => {
    const results = [
      result("a", 1, { judge: { score: 5, reason: "" } }),
      result("b", 0, { judge: { score: 2, reason: "missed it" } }),
      result("c", 0, { checks: [], error: "boom" }),
    ];
    expect(summarize(results)).toEqual({ cases: 3, meanScore: 1 / 3, checksPassed: 1, checksTotal: 2, judgeMean: 3.5 });

    const table = formatTable(results);
    expect(table).toContain("ERROR");
    expect(table).toContain("b: judge 2 - missed it");
    expect(table).toContain("c: boom");
  });
});
