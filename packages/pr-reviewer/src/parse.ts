import { z } from "zod";
import { commentableLines } from "./diff.js";
import type { Chunk, Finding } from "./types.js";

const FindingSchema = z.object({
  path: z.string().min(1),
  line: z.number().int(),
  severity: z.enum(["bug", "risk", "suggestion", "nit"]),
  title: z.string().min(1),
  body: z.string().min(1),
  confidence: z.number().min(0).max(1),
});

const ToolInputSchema = z.object({
  summary: z.string(),
  findings: z.array(z.unknown()),
});

export interface ParseOptions {
  minConfidence: number;
  includeNits: boolean;
  // how far we're willing to move a comment to land on a line GitHub accepts
  snapDistance?: number;
}

export interface ParseResult {
  summary: string;
  findings: Finding[];
  dropped: { finding: unknown; reason: string }[];
}

export function parseFindings(input: unknown, chunk: Chunk, opts: ParseOptions): ParseResult {
  const top = ToolInputSchema.safeParse(input);
  if (!top.success) {
    return { summary: "", findings: [], dropped: [{ finding: input, reason: "invalid tool input" }] };
  }

  const snap = opts.snapDistance ?? 3;
  const filesByPath = new Map(chunk.files.map((f) => [f.path, f]));
  const findings: Finding[] = [];
  const dropped: ParseResult["dropped"] = [];

  for (const raw of top.data.findings) {
    const parsed = FindingSchema.safeParse(raw);
    if (!parsed.success) {
      dropped.push({ finding: raw, reason: "schema" });
      continue;
    }
    const f = { ...parsed.data, path: normalizePath(parsed.data.path) };

    const file = filesByPath.get(f.path);
    if (!file) {
      dropped.push({ finding: f, reason: `path not in chunk: ${f.path}` });
      continue;
    }
    if (f.severity === "nit" && !opts.includeNits) {
      dropped.push({ finding: f, reason: "nit" });
      continue;
    }
    if (f.confidence < opts.minConfidence) {
      dropped.push({ finding: f, reason: `low confidence (${f.confidence})` });
      continue;
    }

    const line = nearestLine(commentableLines(file), f.line, snap);
    if (line === null) {
      dropped.push({ finding: f, reason: `line ${f.line} not in diff` });
      continue;
    }
    findings.push({ ...f, line });
  }

  return { summary: top.data.summary, findings, dropped };
}

// The model sometimes echoes "a/src/foo.ts" or "./src/foo.ts" back.
function normalizePath(p: string): string {
  return p.trim().replace(/^\.\//, "").replace(/^[ab]\//, "");
}

export function nearestLine(lines: Set<number>, target: number, maxDistance: number): number | null {
  if (lines.has(target)) return target;
  for (let d = 1; d <= maxDistance; d++) {
    if (lines.has(target - d)) return target - d;
    if (lines.has(target + d)) return target + d;
  }
  return null;
}
