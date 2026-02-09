#!/usr/bin/env -S npx tsx
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { createClient } from "./client.js";
import { loadConfig } from "./config.js";
import { loadDotenv } from "./env.js";
import { printTable, summaryBody } from "./format.js";
import { GitHub, parsePrRef } from "./github.js";
import { reviewDiff } from "./pipeline.js";
import type { PrContext } from "./review.js";

const USAGE = `usage:
  pr-review --diff <file|->            review a local diff (git diff main... | pr-review --diff -)
  pr-review --pr owner/repo#123        fetch the PR diff from GitHub
  pr-review --pr owner/repo#123 --post post the review back to the PR

options:
  --json            print the full result as JSON
  --model <id>      override REVIEWER_MODEL
  --prompt <v>      prompt version from prompts/reviewer (default v3)
  --budget <n>      token budget for the whole run
  --nits            include nits
  --quiet           no progress logs on stderr`;

async function main() {
  loadDotenv();
  const { values } = parseArgs({
    options: {
      diff: { type: "string" },
      pr: { type: "string" },
      post: { type: "boolean", default: false },
      json: { type: "boolean", default: false },
      model: { type: "string" },
      prompt: { type: "string" },
      budget: { type: "string" },
      nits: { type: "boolean", default: false },
      quiet: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });

  if (values.help || (!values.diff && !values.pr)) {
    console.log(USAGE);
    process.exit(values.help ? 0 : 1);
  }

  const config = loadConfig({
    ...(values.model && { model: values.model }),
    ...(values.prompt && { promptVersion: values.prompt }),
    ...(values.budget && { tokenBudget: Number(values.budget) }),
    ...(values.nits && { includeNits: true }),
  });
  const log = values.quiet ? undefined : (msg: string) => console.error(`[review] ${msg}`);

  let diff: string;
  let pr: PrContext | undefined;
  let gh: GitHub | undefined;
  let headSha: string | undefined;
  const ref = values.pr ? parsePrRef(values.pr) : undefined;

  if (ref) {
    const token = process.env.GITHUB_TOKEN;
    if (!token) throw new Error("GITHUB_TOKEN is required with --pr");
    gh = new GitHub(token);
    const meta = await gh.getPr(ref);
    pr = { title: meta.title, description: meta.body };
    headSha = meta.headSha;
    diff = await gh.getDiff(ref);
  } else {
    diff = values.diff === "-" ? readFileSync(0, "utf8") : readFileSync(values.diff!, "utf8");
  }

  if (!diff.trim()) {
    log?.("empty diff, nothing to do");
    return;
  }

  const result = await reviewDiff(diff, config, { client: createClient(), log }, pr);

  if (values.json) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(printTable(result));
    console.log("\n" + summaryBody(result));
  }

  if (values.post) {
    if (!gh || !ref || !headSha) throw new Error("--post needs --pr");
    await gh.postReview(ref, headSha, summaryBody(result), result.findings);
    log?.(`posted review with ${result.findings.length} comments`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
