import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

// Picks up the repo-root .env for local runs. In Actions everything comes from
// the environment and there's no file, which is fine.
export function loadDotenv(start = process.cwd()): void {
  let dir = start;
  for (let i = 0; i < 5; i++) {
    const file = join(dir, ".env");
    if (existsSync(file)) {
      process.loadEnvFile(file);
      return;
    }
    dir = dirname(dir);
  }
}
