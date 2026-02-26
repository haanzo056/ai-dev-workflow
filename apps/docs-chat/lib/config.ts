import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export function dbPath(): string {
  // the ignore comment stops turbopack from tracing the whole repo into the server output
  return resolve(/*turbopackIgnore: true*/ process.env.DOCS_DB_PATH ?? join(process.cwd(), "data", "docs.db"));
}

export function chatModel(): string {
  return process.env.DOCS_CHAT_MODEL ?? "claude-sonnet-5";
}

export function promptVersion(): string {
  return process.env.DOCS_CHAT_PROMPT_VERSION ?? "v2";
}

export function findPromptsDir(): string {
  if (process.env.PROMPTS_DIR) return resolve(process.env.PROMPTS_DIR);
  let dir = process.cwd();
  for (let i = 0; i < 5; i++) {
    if (existsSync(join(dir, "prompts", "CHANGELOG.md"))) return join(dir, "prompts");
    dir = dirname(dir);
  }
  throw new Error("could not find prompts/ directory, set PROMPTS_DIR");
}
