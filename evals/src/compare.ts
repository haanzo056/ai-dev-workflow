import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { RunFile } from "./types.js";

export const RESULTS_DIR = fileURLToPath(new URL("../results", import.meta.url));

export interface CaseDelta {
  id: string;
  before: number | null;
  after: number | null;
  delta: number | null;
}

export function compareRuns(before: RunFile, after: RunFile): CaseDelta[] {
  const a = new Map(before.results.map((r) => [r.id, r.score]));
  const b = new Map(after.results.map((r) => [r.id, r.score]));
  const ids = [...new Set([...a.keys(), ...b.keys()])].sort();
  return ids.map((id) => {
    const x = a.get(id) ?? null;
    const y = b.get(id) ?? null;
    return { id, before: x, after: y, delta: x !== null && y !== null ? y - x : null };
  });
}

// Anything under this is noise, as far as I can tell from re-running the same
// config a few times. The judge alone moves individual cases by 0.125 regularly.
export const NOISE = 0.1;

export function formatComparison(before: RunFile, after: RunFile): string {
  const rows = compareRuns(before, after);
  const fmt = (n: number | null) => (n === null ? "  -  " : n.toFixed(2));
  const lines = [
    `${before.runId} (${before.gitSha ?? "?"}) -> ${after.runId} (${after.gitSha ?? "?"})`,
    ...configDiff(before.config, after.config),
    "",
  ];
  for (const r of rows) {
    const mark = r.delta === null ? "new/removed" : r.delta <= -NOISE ? "WORSE" : r.delta >= NOISE ? "better" : "";
    lines.push(`${r.id.padEnd(34)} ${fmt(r.before)} -> ${fmt(r.after)}  ${mark}`);
  }
  const d = after.summary.meanScore - before.summary.meanScore;
  lines.push("", `mean ${before.summary.meanScore.toFixed(3)} -> ${after.summary.meanScore.toFixed(3)} (${d >= 0 ? "+" : ""}${d.toFixed(3)})`);
  return lines.join("\n");
}

function configDiff(a: RunFile["config"], b: RunFile["config"]): string[] {
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
  return keys.filter((k) => a[k] !== b[k]).map((k) => `  ${k}: ${a[k] ?? "-"} -> ${b[k] ?? "-"}`);
}

export function loadRun(path: string): RunFile {
  return JSON.parse(readFileSync(path, "utf8")) as RunFile;
}

export function latestRuns(suite: string, n: number): string[] {
  return readdirSync(RESULTS_DIR)
    .filter((f) => f.endsWith(`-${suite}.json`))
    .sort()
    .slice(-n)
    .map((f) => join(RESULTS_DIR, f));
}

function main() {
  const args = process.argv.slice(2);
  let files: string[];
  if (args[0] === "--latest") {
    files = latestRuns(args[1] ?? "reviewer", 2);
    if (files.length < 2) throw new Error("need at least two runs in results/ for that suite");
  } else if (args.length === 2) {
    files = args.map((f) => resolve(f));
  } else {
    console.log("usage: compare <before.json> <after.json> | compare --latest [suite]");
    process.exit(1);
  }
  console.log(formatComparison(loadRun(files[0]!), loadRun(files[1]!)));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
