import type { Judge } from "../judge.js";
import type { CaseResult } from "../types.js";

export interface SuiteOptions {
  filter?: string;
  judge?: Judge;
  concurrency: number;
  log: (msg: string) => void;
}

export interface Suite {
  name: string;
  config(): Record<string, string | number | boolean>;
  run(opts: SuiteOptions): Promise<CaseResult[]>;
}
