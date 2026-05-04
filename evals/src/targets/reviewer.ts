import { createClient, loadConfig, reviewDiff, type ReviewResult } from "@ai-dev-workflow/pr-reviewer";
import { fileURLToPath } from "node:url";
import { loadCases, resolveDiff, ReviewerCase } from "../cases.js";
import { checkMaxFindings, checkMustFind, checkMustNotFlag, scoreCase } from "../scorers.js";
import type { CaseResult, CheckResult, JudgeResult } from "../types.js";
import { mapLimit, truncate } from "../util.js";
import type { Suite } from "./types.js";

const CASES_DIR = fileURLToPath(new URL("../../cases/reviewer", import.meta.url));

function renderFindings(r: ReviewResult): string {
  if (r.findings.length === 0) return "(no findings)";
  return r.findings.map((f) => `- [${f.severity}] ${f.path}:${f.line} ${f.title}\n  ${f.body}`).join("\n");
}

export const reviewerSuite: Suite = {
  name: "reviewer",

  config() {
    const c = loadConfig();
    return { model: c.model, promptVersion: c.promptVersion, minConfidence: c.minConfidence, effort: c.effort };
  },

  async run({ filter, judge, concurrency, log }) {
    const cases = loadCases(CASES_DIR, ReviewerCase).filter((c) => !filter || c.data.id.includes(filter));
    const client = createClient();
    // evals shouldn't be capped by the per-PR comment limit, or a noisy prompt looks quieter than it is
    const config = loadConfig({ maxComments: 50 });

    return mapLimit(cases, concurrency, async ({ file, data: c }): Promise<CaseResult> => {
      const t0 = Date.now();
      try {
        const diff = resolveDiff(c, file);
        const result = await reviewDiff(diff, config, { client }, c.pr_title ? { title: c.pr_title } : undefined);

        const checks: CheckResult[] = [
          ...c.expect.must_find.map((e) => checkMustFind(result.findings, e)),
          ...c.expect.must_not_flag.map((e) => checkMustNotFlag(result.findings, e)),
          ...(c.expect.max_findings !== undefined ? [checkMaxFindings(result.findings, c.expect.max_findings)] : []),
        ];
        if (result.skippedChunks.length > 0) {
          checks.push({ name: "all chunks reviewed", pass: false, detail: result.skippedChunks.map((s) => s.reason).join("; ") });
        }

        let judged: JudgeResult | undefined;
        if (judge && c.rubric) {
          judged = await judge({
            task: "Automated code review of a pull request diff. Output is the list of review comments that would be posted.",
            input: truncate(diff, 12_000),
            output: renderFindings(result),
            rubric: c.rubric,
          });
        }

        log(`${c.id}: ${checks.filter((x) => x.pass).length}/${checks.length}${judged ? ` judge ${judged.score}` : ""}`);
        return {
          id: c.id,
          suite: "reviewer",
          checks,
          judge: judged,
          score: scoreCase(checks, judged),
          output: { findings: result.findings, dropped: result.chunks.flatMap((ch) => ch.dropped) },
          ms: Date.now() - t0,
          usage: { inputTokens: result.usage.inputTokens + result.usage.cacheReadTokens, outputTokens: result.usage.outputTokens },
        };
      } catch (err) {
        log(`${c.id}: error ${String(err)}`);
        return { id: c.id, suite: "reviewer", checks: [], score: 0, output: null, ms: Date.now() - t0, error: String(err) };
      }
    });
  },
};
