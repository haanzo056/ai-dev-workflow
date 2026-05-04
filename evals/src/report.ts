import type { CaseResult, RunFile } from "./types.js";

function pad(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s.padEnd(n);
}

export function summarize(results: CaseResult[]): RunFile["summary"] {
  const checks = results.flatMap((r) => r.checks);
  const judged = results.filter((r) => r.judge);
  return {
    cases: results.length,
    meanScore: results.length ? results.reduce((a, r) => a + r.score, 0) / results.length : 0,
    checksPassed: checks.filter((c) => c.pass).length,
    checksTotal: checks.length,
    judgeMean: judged.length ? judged.reduce((a, r) => a + r.judge!.score, 0) / judged.length : null,
  };
}

export function formatTable(results: CaseResult[]): string {
  const header = `${pad("case", 34)} ${pad("checks", 8)} ${pad("judge", 6)} ${pad("score", 6)} ${pad("time", 7)}`;
  const rows = results.map((r) => {
    const passed = r.checks.filter((c) => c.pass).length;
    const checks = r.error ? "ERROR" : `${passed}/${r.checks.length}`;
    const judge = r.judge ? String(r.judge.score) : "-";
    return `${pad(r.id, 34)} ${pad(checks, 8)} ${pad(judge, 6)} ${pad(r.score.toFixed(2), 6)} ${pad(`${(r.ms / 1000).toFixed(1)}s`, 7)}`;
  });

  const failures = results.flatMap((r) => [
    ...(r.error ? [`  ${r.id}: ${r.error}`] : []),
    ...r.checks.filter((c) => !c.pass).map((c) => `  ${r.id}: ${c.name}${c.detail ? ` (${c.detail})` : ""}`),
    ...(r.judge && r.judge.score <= 3 ? [`  ${r.id}: judge ${r.judge.score} - ${r.judge.reason}`] : []),
  ]);

  const s = summarize(results);
  const lines = [header, "-".repeat(header.length), ...rows, "-".repeat(header.length)];
  lines.push(
    `${s.cases} cases, mean score ${s.meanScore.toFixed(3)}, checks ${s.checksPassed}/${s.checksTotal}` +
      (s.judgeMean !== null ? `, judge mean ${s.judgeMean.toFixed(2)}` : ""),
  );
  if (failures.length > 0) lines.push("", "failures:", ...failures);
  return lines.join("\n");
}
