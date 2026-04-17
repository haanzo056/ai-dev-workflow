import type { CheckResult, JudgeResult } from "./types.js";

export interface FindingLike {
  path: string;
  line: number;
  severity: string;
  title: string;
  body: string;
}

function inRange(line: number, range?: [number, number]): boolean {
  return !range || (line >= range[0] && line <= range[1]);
}

function hasAnyKeyword(text: string, keywords?: string[]): boolean {
  if (!keywords || keywords.length === 0) return true;
  const lower = text.toLowerCase();
  return keywords.some((k) => lower.includes(k.toLowerCase()));
}

export function checkMustFind(
  findings: FindingLike[],
  expected: { path: string; line_range?: [number, number]; severity_in?: string[]; keywords?: string[] },
): CheckResult {
  const match = findings.find(
    (f) =>
      f.path === expected.path &&
      inRange(f.line, expected.line_range) &&
      (!expected.severity_in || expected.severity_in.includes(f.severity)) &&
      hasAnyKeyword(`${f.title} ${f.body}`, expected.keywords),
  );
  const where = expected.line_range ? `${expected.path}:${expected.line_range.join("-")}` : expected.path;
  return {
    name: `finds ${where}`,
    pass: Boolean(match),
    detail: match ? `${match.severity}: ${match.title}` : `no matching finding among ${findings.length}`,
  };
}

export function checkMustNotFlag(findings: FindingLike[], spec: { path: string; line_range?: [number, number] }): CheckResult {
  const hit = findings.find((f) => f.path === spec.path && inRange(f.line, spec.line_range));
  const where = spec.line_range ? `${spec.path}:${spec.line_range.join("-")}` : spec.path;
  return {
    name: `quiet on ${where}`,
    pass: !hit,
    detail: hit ? `flagged: ${hit.severity}: ${hit.title}` : undefined,
  };
}

export function checkMaxFindings(findings: FindingLike[], max: number): CheckResult {
  return { name: `<= ${max} findings`, pass: findings.length <= max, detail: `${findings.length} findings` };
}

export function checkContains(text: string, needle: string): CheckResult {
  return { name: `contains "${needle}"`, pass: text.toLowerCase().includes(needle.toLowerCase()) };
}

export function checkNotContains(text: string, needle: string): CheckResult {
  return { name: `not "${needle}"`, pass: !text.toLowerCase().includes(needle.toLowerCase()) };
}

export function checkSourcesInclude(paths: string[], expected: string, label = "retrieved"): CheckResult {
  return { name: `${label} ${expected}`, pass: paths.includes(expected), detail: paths.join(", ") || "(none)" };
}

// Declining is judged by phrasing, which is fragile. The prompt asks for a
// specific sentence so this mostly works, the judge covers the rest.
const DECLINE_PATTERNS = [/don't cover/i, /do not cover/i, /not (mentioned|covered|documented)/i, /no information/i];

export function checkDeclines(text: string, shouldDecline: boolean): CheckResult {
  const declined = DECLINE_PATTERNS.some((re) => re.test(text));
  return {
    name: shouldDecline ? "declines" : "answers",
    pass: declined === shouldDecline,
  };
}

// Checks and the judge are weighted equally when both exist. Checks alone
// can't tell a vague answer from a good one; the judge alone drifts.
export function scoreCase(checks: CheckResult[], judge?: JudgeResult): number {
  const checkScore = checks.length === 0 ? null : checks.filter((c) => c.pass).length / checks.length;
  const judgeScore = judge ? (judge.score - 1) / 4 : null;
  if (checkScore !== null && judgeScore !== null) return (checkScore + judgeScore) / 2;
  return checkScore ?? judgeScore ?? 0;
}
