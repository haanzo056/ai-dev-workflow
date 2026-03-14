import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { dbPath } from "../lib/config";
import { getEmbedder } from "../lib/embeddings";
import { chunkMarkdown, embeddingText, type DocChunk } from "../lib/markdown-chunker";
import { openDb, writeIndex, type StoredChunk } from "../lib/store";

const SKIP_DIRS = new Set(["node_modules", ".git", ".next", "dist"]);
// changelogs are huge, mostly noise, and win retrieval for every version question
const SKIP_FILES = /(^|\/)(CHANGELOG|CHANGES)\.md$/i;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.mdx?$/.test(name)) out.push(full);
  }
  return out.sort();
}

async function main() {
  if (existsSync("../../.env")) process.loadEnvFile("../../.env");
  const { values } = parseArgs({
    options: {
      docs: { type: "string", default: "sample-docs" },
      db: { type: "string" },
    },
  });
  const docsDir = resolve(values.docs!);
  const out = values.db ? resolve(values.db) : dbPath();

  const files = walk(docsDir).filter((f) => !SKIP_FILES.test(f));
  if (files.length === 0) throw new Error(`no markdown files under ${docsDir}`);

  const chunks: DocChunk[] = files.flatMap((f) =>
    chunkMarkdown(relative(docsDir, f), readFileSync(f, "utf8")),
  );
  const embedder = getEmbedder();
  console.log(`${files.length} files -> ${chunks.length} chunks, embedding with ${embedder.name}`);

  const t0 = Date.now();
  const vectors = await embedder.embed(chunks.map(embeddingText), "document");
  const stored: StoredChunk[] = chunks.map((c, i) => ({ ...c, embedding: vectors[i]! }));

  const db = openDb(out, { create: true });
  try {
    writeIndex(db, stored, {
      embedder: embedder.name,
      dims: embedder.dims,
      builtAt: new Date().toISOString(),
      files: files.length,
    });
  } finally {
    db.close();
  }

  const sizes = chunks.map((c) => c.text.length).sort((a, b) => a - b);
  const median = sizes[Math.floor(sizes.length / 2)];
  console.log(`wrote ${out} in ${Date.now() - t0}ms (median chunk ${median} chars, max ${sizes.at(-1)})`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
