// USD per million tokens. Only used for the cost line in the summary, so it's
// fine if this drifts a bit - update when the pricing page changes.
const PRICES: Record<string, { input: number; output: number }> = {
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-opus-5": { input: 5, output: 25 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};

export interface TokenCounts {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
}

export function estimateCostUsd(model: string, t: TokenCounts): number | null {
  const p = PRICES[model];
  if (!p) return null;
  // cache reads bill at ~10% of input; ignoring cache writes (+25%), they're a rounding error here
  const input = t.inputTokens * p.input + (t.cacheReadTokens ?? 0) * p.input * 0.1;
  return (input + t.outputTokens * p.output) / 1_000_000;
}
