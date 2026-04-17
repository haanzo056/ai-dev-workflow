import { describe, expect, it } from "vitest";
import {
  checkContains,
  checkDeclines,
  checkMaxFindings,
  checkMustFind,
  checkMustNotFlag,
  checkNotContains,
  checkSourcesInclude,
  scoreCase,
} from "../src/scorers.js";

const f = (over: Partial<{ path: string; line: number; severity: string; title: string; body: string }> = {}) => ({
  path: "src/a.ts",
  line: 10,
  severity: "bug",
  title: "Missing await",
  body: "getUser returns a Promise, so the null check never runs.",
  ...over,
});

describe("checkMustFind", () => {
  it("matches on path, range, severity and any keyword", () => {
    const r = checkMustFind([f()], { path: "src/a.ts", line_range: [8, 12], severity_in: ["bug"], keywords: ["AWAIT"] });
    expect(r.pass).toBe(true);
    expect(r.detail).toBe("bug: Missing await");
  });

  it("fails when any constraint misses", () => {
    expect(checkMustFind([f()], { path: "src/b.ts" }).pass).toBe(false);
    expect(checkMustFind([f()], { path: "src/a.ts", line_range: [1, 5] }).pass).toBe(false);
    expect(checkMustFind([f()], { path: "src/a.ts", severity_in: ["risk"] }).pass).toBe(false);
    expect(checkMustFind([f()], { path: "src/a.ts", keywords: ["injection"] }).pass).toBe(false);
  });

  it("passes if any one finding matches", () => {
    const r = checkMustFind([f({ path: "x.ts" }), f({ line: 11, title: "Promise not awaited" })], {
      path: "src/a.ts",
      keywords: ["promise"],
    });
    expect(r.pass).toBe(true);
  });
});

describe("checkMustNotFlag / checkMaxFindings", () => {
  it("fails when a finding lands in the quiet zone", () => {
    expect(checkMustNotFlag([f()], { path: "src/a.ts", line_range: [9, 11] }).pass).toBe(false);
    expect(checkMustNotFlag([f()], { path: "src/a.ts", line_range: [20, 30] }).pass).toBe(true);
    expect(checkMustNotFlag([], { path: "src/a.ts" }).pass).toBe(true);
  });

  it("counts findings", () => {
    expect(checkMaxFindings([f(), f()], 1)).toMatchObject({ pass: false, detail: "2 findings" });
    expect(checkMaxFindings([], 0).pass).toBe(true);
  });
});

describe("text checks", () => {
  it("is case-insensitive", () => {
    expect(checkContains("Use Instant Rollback in Vercel", "instant rollback").pass).toBe(true);
    expect(checkNotContains("add retries(2) to the test", "RETRIES(").pass).toBe(false);
  });

  it("detects declines", () => {
    expect(checkDeclines("The docs I have don't cover that.", true).pass).toBe(true);
    expect(checkDeclines("Kubernetes autoscaling is configured via HPA...", true).pass).toBe(false);
    expect(checkDeclines("Use FLAGS_OVERRIDE in .env.local [1].", false).pass).toBe(true);
  });

  it("checks sources", () => {
    expect(checkSourcesInclude(["a.md", "b.md"], "b.md").pass).toBe(true);
    expect(checkSourcesInclude([], "b.md")).toMatchObject({ pass: false, detail: "(none)" });
  });
});

describe("scoreCase", () => {
  const pass = { name: "a", pass: true };
  const fail = { name: "b", pass: false };

  it("averages checks and normalized judge score", () => {
    expect(scoreCase([pass, fail], { score: 5, reason: "" })).toBeCloseTo(0.75);
    expect(scoreCase([pass, pass], { score: 1, reason: "" })).toBeCloseTo(0.5);
  });

  it("falls back to whichever exists", () => {
    expect(scoreCase([pass, fail, fail, pass])).toBe(0.5);
    expect(scoreCase([], { score: 4, reason: "" })).toBeCloseTo(0.75);
    expect(scoreCase([])).toBe(0);
  });
});
