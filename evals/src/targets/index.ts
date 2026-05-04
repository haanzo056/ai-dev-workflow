import { ragSuite } from "./rag.js";
import { reviewerSuite } from "./reviewer.js";
import type { Suite } from "./types.js";

export const SUITES: Record<string, Suite> = {
  reviewer: reviewerSuite,
  rag: ragSuite,
};
