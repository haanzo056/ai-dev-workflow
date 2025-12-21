import type { Severity } from "./types.js";

export interface ReviewerConfig {
  model: string;
  promptVersion: string;
  maxTokensPerChunk: number;
  maxOutputTokens: number;
  tokenBudget: number;
  concurrency: number;
  minConfidence: number;
  includeNits: boolean;
  maxComments: number;
  effort: "low" | "medium" | "high";
}

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`${name} must be a number, got "${raw}"`);
  return n;
}

export function loadConfig(overrides: Partial<ReviewerConfig> = {}): ReviewerConfig {
  const effort = process.env.REVIEWER_EFFORT ?? "medium";
  if (effort !== "low" && effort !== "medium" && effort !== "high") {
    throw new Error(`REVIEWER_EFFORT must be low|medium|high, got "${effort}"`);
  }
  return {
    model: process.env.REVIEWER_MODEL ?? "claude-sonnet-5",
    promptVersion: process.env.REVIEWER_PROMPT_VERSION ?? "v3",
    maxTokensPerChunk: num("REVIEWER_MAX_TOKENS_PER_CHUNK", 12_000),
    maxOutputTokens: num("REVIEWER_MAX_OUTPUT_TOKENS", 8_000),
    tokenBudget: num("REVIEWER_TOKEN_BUDGET", 200_000),
    concurrency: num("REVIEWER_CONCURRENCY", 3),
    minConfidence: num("REVIEWER_MIN_CONFIDENCE", 0.6),
    includeNits: process.env.REVIEWER_INCLUDE_NITS === "1",
    maxComments: num("REVIEWER_MAX_COMMENTS", 12),
    effort,
    ...overrides,
  };
}

export const SEVERITY_RANK: Record<Severity, number> = { bug: 0, risk: 1, suggestion: 2, nit: 3 };
