import type Anthropic from "@anthropic-ai/sdk";
import { TokenBudget } from "./budget.js";
import { planChunks } from "./chunk.js";
import { SEVERITY_RANK, type ReviewerConfig } from "./config.js";
import { parseUnifiedDiff } from "./diff.js";
import { parseFindings } from "./parse.js";
import { estimateCostUsd } from "./pricing.js";
import { loadPrompt } from "./prompt.js";
import { withRetry } from "./retry.js";
import { reviewChunk, type PrContext } from "./review.js";
import { estimateTokens } from "./tokens.js";
import type { ChunkResult, Finding } from "./types.js";

export interface ReviewResult {
  model: string;
  promptVersion: string;
  findings: Finding[];
  chunks: ChunkResult[];
  skippedFiles: { path: string; reason: string }[];
  skippedChunks: { chunkId: string; paths: string[]; reason: string }[];
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number };
  costUsd: number | null;
  ms: number;
}

export interface ReviewDeps {
  client: Anthropic;
  log?: (msg: string) => void;
}

export async function reviewDiff(
  diffText: string,
  config: ReviewerConfig,
  deps: ReviewDeps,
  pr?: PrContext,
): Promise<ReviewResult> {
  const started = Date.now();
  const log = deps.log ?? (() => {});
  const system = loadPrompt("reviewer", config.promptVersion);
  const systemTokens = estimateTokens(system);

  const files = parseUnifiedDiff(diffText);
  const plan = planChunks(files, { maxTokensPerChunk: config.maxTokensPerChunk });
  log(`${files.length} files, ${plan.chunks.length} chunks, ${plan.skipped.length} skipped`);

  const budget = new TokenBudget(config.tokenBudget);
  const results: ChunkResult[] = [];
  const skippedChunks: ReviewResult["skippedChunks"] = [];

  // Output is usually 300-1500 tokens; reserving the full max_tokens would
  // make the budget reject chunks that would easily fit.
  const expectedOutput = Math.min(config.maxOutputTokens, 2000);

  await mapLimit(plan.chunks, config.concurrency, async (chunk) => {
    const estimate = systemTokens + chunk.estTokens + 300 + expectedOutput;
    const paths = chunk.files.map((f) => f.path);
    if (!budget.tryReserve(estimate)) {
      skippedChunks.push({ chunkId: chunk.id, paths, reason: "token budget" });
      log(`${chunk.id}: skipped, over budget (${budget.remaining} left, needs ~${estimate})`);
      return;
    }

    const t0 = Date.now();
    try {
      const raw = await withRetry(
        () =>
          reviewChunk(deps.client, chunk, {
            model: config.model,
            system,
            maxOutputTokens: config.maxOutputTokens,
            effort: config.effort,
            pr,
          }),
        { onRetry: (err, n, ms) => log(`${chunk.id}: retry ${n} in ${Math.round(ms)}ms (${String(err)})`) },
      );
      budget.settle(estimate, raw.usage);

      const parsed =
        raw.input === null
          ? { summary: "", findings: [], dropped: [{ finding: null, reason: `no findings: ${raw.stopReason}` }] }
          : parseFindings(raw.input, chunk, config);

      results.push({
        chunkId: chunk.id,
        findings: parsed.findings,
        dropped: parsed.dropped,
        summary: parsed.summary,
        usage: raw.usage,
        ms: Date.now() - t0,
      });
      log(`${chunk.id}: ${parsed.findings.length} findings, ${parsed.dropped.length} dropped, ${Date.now() - t0}ms`);
    } catch (err) {
      budget.release(estimate);
      skippedChunks.push({ chunkId: chunk.id, paths, reason: `error: ${String(err)}` });
      log(`${chunk.id}: failed - ${String(err)}`);
    }
  });

  results.sort((a, b) => a.chunkId.localeCompare(b.chunkId, undefined, { numeric: true }));

  const usage = results.reduce(
    (acc, r) => ({
      inputTokens: acc.inputTokens + r.usage.inputTokens,
      outputTokens: acc.outputTokens + r.usage.outputTokens,
      cacheReadTokens: acc.cacheReadTokens + r.usage.cacheReadTokens,
    }),
    { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 },
  );

  return {
    model: config.model,
    promptVersion: config.promptVersion,
    findings: rankFindings(
      results.flatMap((r) => r.findings),
      config.maxComments,
    ),
    chunks: results,
    skippedFiles: plan.skipped,
    skippedChunks,
    usage,
    costUsd: estimateCostUsd(config.model, usage),
    ms: Date.now() - started,
  };
}

export function rankFindings(findings: Finding[], max: number): Finding[] {
  const seen = new Map<string, Finding>();
  for (const f of findings) {
    const key = `${f.path}:${f.line}`;
    const prev = seen.get(key);
    if (!prev || SEVERITY_RANK[f.severity] < SEVERITY_RANK[prev.severity]) seen.set(key, f);
  }
  return [...seen.values()]
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.confidence - a.confidence)
    .slice(0, max);
}

async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const item = items[next++]!;
      await fn(item);
    }
  });
  await Promise.all(workers);
}
