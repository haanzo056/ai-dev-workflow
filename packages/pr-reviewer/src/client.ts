import Anthropic from "@anthropic-ai/sdk";

export function createClient(): Anthropic {
  // withRetry() owns retries. Leaving the SDK default (2) on top of that meant
  // up to 15 attempts per chunk during the 529 storm.
  return new Anthropic({ maxRetries: 0, timeout: 120_000 });
}
