import { fileURLToPath } from "node:url";
import { parseUnifiedDiff } from "@ai-dev-workflow/pr-reviewer";
import { describe, expect, it } from "vitest";
import { loadCases, RagCase, resolveDiff, ReviewerCase } from "../src/cases.js";

const dir = (name: string) => fileURLToPath(new URL(`../cases/${name}`, import.meta.url));

// Cheap sanity check so a typo in a case file fails CI instead of an eval run.
describe("case files", () => {
  it("reviewer cases parse and their diffs are valid", () => {
    const cases = loadCases(dir("reviewer"), ReviewerCase);
    expect(cases.length).toBeGreaterThan(0);
    const ids = new Set<string>();
    for (const { file, data } of cases) {
      expect(ids.has(data.id), `duplicate id ${data.id}`).toBe(false);
      ids.add(data.id);
      const files = parseUnifiedDiff(resolveDiff(data, file));
      expect(files.length, data.id).toBeGreaterThan(0);
      const paths = files.map((f) => f.path);
      for (const e of data.expect.must_find) expect(paths, data.id).toContain(e.path);
    }
  });

  it("rag cases parse", () => {
    const cases = loadCases(dir("rag"), RagCase);
    expect(cases.length).toBeGreaterThan(0);
    for (const { data } of cases) {
      const expectsSomething =
        data.expect.should_decline || data.expect.answer_contains.length > 0 || data.expect.cites.length > 0;
      expect(expectsSomething, data.id).toBe(true);
    }
  });
});
