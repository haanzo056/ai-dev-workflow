import Anthropic from "@anthropic-ai/sdk";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { answerText } from "../../../apps/docs-chat/lib/answer";
import { checkCitations } from "../../../apps/docs-chat/lib/citations";
import { chatModel, promptVersion } from "../../../apps/docs-chat/lib/config";
import { loadCases, RagCase } from "../cases.js";
import { checkContains, checkDeclines, checkNotContains, checkSourcesInclude, scoreCase } from "../scorers.js";
import type { CaseResult, CheckResult, JudgeResult } from "../types.js";
import { mapLimit } from "../util.js";
import type { Suite } from "./types.js";

const CASES_DIR = fileURLToPath(new URL("../../cases/rag", import.meta.url));
const DEFAULT_DB = fileURLToPath(new URL("../../../apps/docs-chat/data/docs.db", import.meta.url));

function dbPath(): string {
  return process.env.DOCS_DB_PATH ?? DEFAULT_DB;
}

export const ragSuite: Suite = {
  name: "rag",

  config() {
    return {
      model: chatModel(),
      promptVersion: promptVersion(),
      embeddings: process.env.EMBEDDINGS_PROVIDER ?? "local",
    };
  },

  async run({ filter, judge, concurrency, log }) {
    if (!existsSync(dbPath())) {
      throw new Error(`no index at ${dbPath()} - run: npm run ingest -w @ai-dev-workflow/docs-chat`);
    }

    const cases = loadCases(CASES_DIR, RagCase).filter((c) => !filter || c.data.id.includes(filter));
    const client = new Anthropic();

    return mapLimit(cases, concurrency, async ({ data: c }): Promise<CaseResult> => {
      const t0 = Date.now();
      try {
        const turns = [...c.history, { role: "user" as const, content: c.question }];
        const { text, sources, done } = await answerText(turns, { client, dbPath: dbPath() });
        const retrievedPaths = [...new Set(sources.map((s) => s.path))];
        const cites = checkCitations(text, sources);

        const checks: CheckResult[] = [
          ...c.expect.sources_include.map((p) => checkSourcesInclude(retrievedPaths, p)),
          ...c.expect.cites.map((p) => checkSourcesInclude(cites.citedPaths, p, "cites")),
          ...c.expect.answer_contains.map((s) => checkContains(text, s)),
          ...c.expect.answer_not_contains.map((s) => checkNotContains(text, s)),
          checkDeclines(text, c.expect.should_decline),
          { name: "citations valid", pass: cites.invalid.length === 0, detail: cites.invalid.length ? `invalid: ${cites.invalid.join(",")}` : undefined },
        ];

        let judged: JudgeResult | undefined;
        if (judge && c.rubric) {
          judged = await judge({
            task: "Answer a developer's question about the project using only the project's documentation, with [n] citations.",
            input: c.history.length ? `${c.history.map((t) => `${t.role}: ${t.content}`).join("\n")}\nuser: ${c.question}` : c.question,
            output: text,
            rubric: c.rubric,
          });
        }

        log(`${c.id}: ${checks.filter((x) => x.pass).length}/${checks.length}${judged ? ` judge ${judged.score}` : ""}`);
        return {
          id: c.id,
          suite: "rag",
          checks,
          judge: judged,
          score: scoreCase(checks, judged),
          output: { text, sources: sources.map((s) => `${s.n}. ${s.path} (${s.score})`), ttftMs: done?.ttftMs ?? null },
          ms: Date.now() - t0,
          usage: done?.usage,
        };
      } catch (err) {
        log(`${c.id}: error ${String(err)}`);
        return { id: c.id, suite: "rag", checks: [], score: 0, output: null, ms: Date.now() - t0, error: String(err) };
      }
    });
  },
};
