import Anthropic from "@anthropic-ai/sdk";

export interface RetryOptions {
  retries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  onRetry?: (err: unknown, attempt: number, delayMs: number) => void;
  sleep?: (ms: number) => Promise<void>;
}

const defaults: RetryOptions = { retries: 4, baseDelayMs: 1000, maxDelayMs: 30_000 };

export function isRetryable(err: unknown): boolean {
  if (err instanceof Anthropic.APIConnectionError) return true;
  if (err instanceof Anthropic.RateLimitError) return true;
  if (err instanceof Anthropic.InternalServerError) return true;
  // 529 overloaded comes through as a generic APIError with that status
  if (err instanceof Anthropic.APIError && (err.status === 529 || err.status === 408)) return true;
  return false;
}

function retryAfterMs(err: unknown): number | null {
  if (!(err instanceof Anthropic.APIError)) return null;
  const raw = err.headers?.get?.("retry-after");
  if (!raw) return null;
  const secs = Number(raw);
  return Number.isFinite(secs) ? secs * 1000 : null;
}

export async function withRetry<T>(fn: () => Promise<T>, opts: Partial<RetryOptions> = {}): Promise<T> {
  const o = { ...defaults, ...opts };
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= o.retries || !isRetryable(err)) throw err;
      const backoff = Math.min(o.maxDelayMs, o.baseDelayMs * 2 ** attempt);
      const jittered = backoff / 2 + Math.random() * (backoff / 2);
      const delay = Math.max(retryAfterMs(err) ?? 0, jittered);
      o.onRetry?.(err, attempt + 1, delay);
      await sleep(delay);
    }
  }
}
