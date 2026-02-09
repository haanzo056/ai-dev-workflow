import type { ReviewResult } from "./pipeline.js";
import type { Finding } from "./types.js";

export const MARKER = "<!-- ai-pr-reviewer -->";

export function commentBody(f: Finding): string {
  return `**${f.severity}**: ${f.title}\n\n${f.body}`;
}

export function summaryBody(r: ReviewResult): string {
  const lines: string[] = [MARKER];
  const summaries = r.chunks.map((c) => c.summary).filter(Boolean);

  if (r.findings.length === 0) lines.push("No issues worth flagging.");
  else lines.push(`${r.findings.length} comment(s).`);

  if (summaries.length > 0) {
    lines.push("", ...summaries.map((s) => `- ${s}`));
  }

  if (r.skippedChunks.length > 0) {
    lines.push("", "Not reviewed:");
    for (const s of r.skippedChunks) lines.push(`- ${s.paths.join(", ")} (${s.reason})`);
  }

  const cost = r.costUsd === null ? "" : `, ~$${r.costUsd.toFixed(3)}`;
  lines.push(
    "",
    `<sub>${r.model}, prompt ${r.promptVersion}, ${r.usage.inputTokens + r.usage.cacheReadTokens} in / ${r.usage.outputTokens} out${cost}, ${(r.ms / 1000).toFixed(1)}s. Automated review, treat as a second opinion.</sub>`,
  );
  return lines.join("\n");
}

// Used when inline comments get rejected, so findings aren't lost.
export function findingsAsMarkdown(findings: Finding[]): string {
  return findings.map((f) => `- \`${f.path}:${f.line}\` ${commentBody(f).replace(/\n\n/, " - ")}`).join("\n");
}

export function printTable(r: ReviewResult): string {
  if (r.findings.length === 0) return "no findings";
  return r.findings
    .map((f) => `${f.severity.padEnd(10)} ${`${f.path}:${f.line}`.padEnd(48)} ${f.title}`)
    .join("\n");
}
