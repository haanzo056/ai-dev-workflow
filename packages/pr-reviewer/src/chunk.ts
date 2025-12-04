import { renderFile } from "./diff.js";
import { estimateTokens } from "./tokens.js";
import type { Chunk, FileDiff, Hunk } from "./types.js";

export interface ChunkOptions {
  maxTokensPerChunk: number;
  ignore?: RegExp[];
}

export const DEFAULT_IGNORE: RegExp[] = [
  /(^|\/)package-lock\.json$/,
  /(^|\/)pnpm-lock\.yaml$/,
  /(^|\/)yarn\.lock$/,
  /\.snap$/,
  /\.min\.(js|css)$/,
  /(^|\/)(dist|build|\.next|generated)\//,
  /\.(png|jpe?g|gif|webp|ico|woff2?|ttf|pdf)$/,
];

export interface ChunkPlan {
  chunks: Chunk[];
  skipped: { path: string; reason: string }[];
}

export function planChunks(files: FileDiff[], opts: ChunkOptions): ChunkPlan {
  const ignore = opts.ignore ?? DEFAULT_IGNORE;
  const skipped: ChunkPlan["skipped"] = [];
  const reviewable: FileDiff[] = [];

  for (const f of files) {
    if (f.binary) skipped.push({ path: f.path, reason: "binary" });
    else if (f.status === "deleted") skipped.push({ path: f.path, reason: "deleted" });
    else if (ignore.some((re) => re.test(f.path))) skipped.push({ path: f.path, reason: "ignored" });
    else if (f.hunks.length === 0) skipped.push({ path: f.path, reason: "no hunks" });
    else reviewable.push(f);
  }

  const chunks: Chunk[] = [];
  let pending: FileDiff[] = [];
  let pendingTokens = 0;

  const flush = () => {
    if (pending.length === 0) return;
    chunks.push(makeChunk(chunks.length, pending));
    pending = [];
    pendingTokens = 0;
  };

  for (const f of reviewable) {
    const tokens = estimateTokens(renderFile(f));

    if (tokens > opts.maxTokensPerChunk) {
      flush();
      const parts = splitFile(f, opts.maxTokensPerChunk);
      parts.forEach((hunks, i) => {
        const c = makeChunk(chunks.length, [{ ...f, hunks }]);
        c.partOf = { path: f.path, part: i + 1, total: parts.length };
        chunks.push(c);
      });
      continue;
    }

    // Small files get packed together. One request per 3-line change was
    // mostly paying for the system prompt over and over.
    if (pendingTokens + tokens > opts.maxTokensPerChunk) flush();
    pending.push(f);
    pendingTokens += tokens;
  }
  flush();

  return { chunks, skipped };
}

function splitFile(f: FileDiff, max: number): Hunk[][] {
  const parts: Hunk[][] = [];
  let cur: Hunk[] = [];
  let curTokens = 0;
  for (const h of f.hunks) {
    const t = estimateTokens(renderFile(f, [h]));
    if (cur.length > 0 && curTokens + t > max) {
      parts.push(cur);
      cur = [];
      curTokens = 0;
    }
    // TODO: a single hunk bigger than max still goes through as one oversized
    // chunk. Happens with generated code mostly, which should be ignored anyway.
    cur.push(h);
    curTokens += t;
  }
  if (cur.length > 0) parts.push(cur);
  return parts;
}

function makeChunk(index: number, files: FileDiff[]): Chunk {
  const text = files.map((f) => renderFile(f)).join("\n\n");
  return { id: `c${index + 1}`, files, text, estTokens: estimateTokens(text) };
}
