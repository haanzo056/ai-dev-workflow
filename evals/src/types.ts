export interface CheckResult {
  name: string;
  pass: boolean;
  detail?: string;
}

export interface JudgeResult {
  score: number;
  reason: string;
}

export interface CaseResult {
  id: string;
  suite: string;
  checks: CheckResult[];
  judge?: JudgeResult;
  // 0..1, see scoreCase()
  score: number;
  output: unknown;
  ms: number;
  usage?: { inputTokens: number; outputTokens: number };
  error?: string;
}

export interface RunFile {
  runId: string;
  startedAt: string;
  gitSha: string | null;
  suite: string;
  config: Record<string, string | number | boolean>;
  results: CaseResult[];
  summary: { cases: number; meanScore: number; checksPassed: number; checksTotal: number; judgeMean: number | null };
}
