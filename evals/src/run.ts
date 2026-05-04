import { loadDotenv } from "@ai-dev-workflow/pr-reviewer";
import Anthropic from "@anthropic-ai/sdk";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { formatComparison, loadRun, RESULTS_DIR } from "./compare.js";
import { createJudge } from "./judge.js";
import { formatTable, summarize } from "./report.js";
import { SUITES } from "./targets/index.js";
import type { RunFile } from "./types.js";
import { gitSha } from "./util.js";

const USAGE = `usage: evals [suite...] [--filter <id>] [--no-judge] [--concurrency n] [--baseline file.json]
suites: ${Object.keys(SUITES).join(", ")} (default: all)`;

async function main() {
  loadDotenv();
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      filter: { type: "string" },
      "no-judge": { type: "boolean", default: false },
      concurrency: { type: "string", default: "3" },
      baseline: { type: "string" },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  if (values.help) {
    console.log(USAGE);
    return;
  }

  const names = positionals.length > 0 ? positionals : Object.keys(SUITES);
  for (const n of names) if (!SUITES[n]) throw new Error(`unknown suite "${n}"\n${USAGE}`);

  const judgeModel = process.env.EVAL_JUDGE_MODEL ?? "claude-sonnet-5";
  const judge = values["no-judge"] ? undefined : createJudge(new Anthropic({ maxRetries: 4 }), judgeModel);
  mkdirSync(RESULTS_DIR, { recursive: true });

  for (const name of names) {
    const suite = SUITES[name]!;
    const startedAt = new Date().toISOString();
    console.error(`\n== ${name}`);

    const results = await suite.run({
      filter: values.filter,
      judge,
      concurrency: Number(values.concurrency),
      log: (m) => console.error(`  ${m}`),
    });

    const run: RunFile = {
      runId: `${startedAt.replace(/[:.]/g, "-").slice(0, 19)}-${name}`,
      startedAt,
      gitSha: gitSha(),
      suite: name,
      config: { ...suite.config(), judge: judge ? judgeModel : "off", ...(values.filter && { filter: values.filter }) },
      results,
      summary: summarize(results),
    };
    const out = join(RESULTS_DIR, `${run.runId}.json`);
    writeFileSync(out, JSON.stringify(run, null, 2));

    console.log(`\n${name}\n${formatTable(results)}\n\nsaved ${out}`);
    if (values.baseline) {
      const base = loadRun(values.baseline);
      if (base.suite === name) console.log(`\n${formatComparison(base, run)}`);
    }
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
