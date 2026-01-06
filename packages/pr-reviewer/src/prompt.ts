import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

function findPromptsDir(): string {
  if (process.env.PROMPTS_DIR) return resolve(process.env.PROMPTS_DIR);
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, "prompts");
    if (existsSync(join(candidate, "CHANGELOG.md"))) return candidate;
    dir = dirname(dir);
  }
  throw new Error("could not find prompts/ directory, set PROMPTS_DIR");
}

export function loadPrompt(name: string, version: string): string {
  const file = join(findPromptsDir(), name, `${version}.md`);
  if (!existsSync(file)) throw new Error(`prompt not found: ${file}`);
  return readFileSync(file, "utf8").trim();
}
