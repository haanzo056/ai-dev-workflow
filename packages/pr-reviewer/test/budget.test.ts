import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { TokenBudget } from "../src/budget.js";
import { isRetryable, withRetry } from "../src/retry.js";

describe("TokenBudget", () => {
  it("reserves, settles against actual usage and releases on failure", () => {
    const b = new TokenBudget(10_000);
    expect(b.tryReserve(4000)).toBe(true);
    expect(b.tryReserve(4000)).toBe(true);
    expect(b.tryReserve(4000)).toBe(false);

    b.settle(4000, { inputTokens: 2500, outputTokens: 500 });
    expect(b.used).toBe(3000);
    expect(b.remaining).toBe(3000);

    b.release(4000);
    expect(b.remaining).toBe(7000);
    expect(b.tryReserve(4000)).toBe(true);
  });
});

describe("withRetry", () => {
  const noSleep = () => Promise.resolve();
  const rateLimited = () => new Anthropic.RateLimitError(429, { type: "error" }, "rate limited", new Headers());

  it("retries retryable errors then succeeds", async () => {
    const fn = vi.fn().mockRejectedValueOnce(rateLimited()).mockRejectedValueOnce(rateLimited()).mockResolvedValue("ok");
    await expect(withRetry(fn, { sleep: noSleep })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("gives up after the configured retries", async () => {
    const fn = vi.fn().mockRejectedValue(rateLimited());
    await expect(withRetry(fn, { retries: 2, sleep: noSleep })).rejects.toBeInstanceOf(Anthropic.RateLimitError);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("does not retry a 400", async () => {
    const err = new Anthropic.BadRequestError(400, { type: "error" }, "bad", new Headers());
    const fn = vi.fn().mockRejectedValue(err);
    await expect(withRetry(fn, { sleep: noSleep })).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(isRetryable(new Error("random"))).toBe(false);
  });

  it("respects retry-after", async () => {
    const delays: number[] = [];
    const err = new Anthropic.RateLimitError(429, { type: "error" }, "slow down", new Headers({ "retry-after": "7" }));
    const fn = vi.fn().mockRejectedValueOnce(err).mockResolvedValue(1);
    await withRetry(fn, { sleep: async (ms) => void delays.push(ms), baseDelayMs: 10 });
    expect(delays).toEqual([7000]);
  });
});
