import type Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Source } from "./citations";
import { chatModel, findPromptsDir, promptVersion } from "./config";
import { retrieve, type Retrieved } from "./retrieve";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export type AnswerEvent =
  | { type: "sources"; sources: Source[] }
  | { type: "text"; text: string }
  | {
      type: "done";
      stopReason: string | null;
      usage: { inputTokens: number; outputTokens: number };
      ttftMs: number | null;
      ms: number;
    }
  | { type: "error"; message: string };

export interface AnswerOptions {
  client: Anthropic;
  dbPath: string;
  model?: string;
  promptVersion?: string;
  k?: number;
  signal?: AbortSignal;
}

export const NO_SOURCES_ANSWER = "The docs I have don't cover that.";

const promptCache = new Map<string, string>();

function systemPrompt(version: string): string {
  let p = promptCache.get(version);
  if (!p) {
    p = readFileSync(join(findPromptsDir(), "docs-chat", `${version}.md`), "utf8").trim();
    promptCache.set(version, p);
  }
  return p;
}

// Follow-ups like "and on staging?" retrieve nothing useful on their own.
// Gluing the previous question on is crude but fixed most of those cases.
// Proper fix is probably a cheap query-rewrite call, haven't measured if it's worth the latency.
export function retrievalQuery(turns: ChatTurn[]): string {
  const users = turns.filter((t) => t.role === "user").map((t) => t.content.trim());
  const last = users.at(-1) ?? "";
  const prev = users.at(-2);
  if (prev && last.split(/\s+/).length < 8) return `${prev}\n${last}`;
  return last;
}

export function formatSources(retrieved: Retrieved[]): string {
  const items = retrieved.map((r, i) => {
    const heading = r.chunk.headings.join(" > ");
    return `<source n="${i + 1}" path="${r.chunk.path}" heading="${heading}">\n${r.chunk.text}\n</source>`;
  });
  return `<sources>\n${items.join("\n")}\n</sources>`;
}

export function toSources(retrieved: Retrieved[]): Source[] {
  return retrieved.map((r, i) => ({
    n: i + 1,
    path: r.chunk.path,
    headings: r.chunk.headings,
    startLine: r.chunk.startLine,
    score: Number(r.score.toFixed(3)),
  }));
}

export async function* answer(turns: ChatTurn[], opts: AnswerOptions): AsyncGenerator<AnswerEvent> {
  const started = Date.now();
  const last = turns.at(-1);
  if (!last || last.role !== "user") {
    yield { type: "error", message: "last message must be from the user" };
    return;
  }

  const retrieved = await retrieve(retrievalQuery(turns), { dbPath: opts.dbPath, k: opts.k });
  yield { type: "sources", sources: toSources(retrieved) };

  if (retrieved.length === 0) {
    yield { type: "text", text: NO_SOURCES_ANSWER };
    yield { type: "done", stopReason: "no_sources", usage: { inputTokens: 0, outputTokens: 0 }, ttftMs: null, ms: Date.now() - started };
    return;
  }

  // Only the latest turn carries sources. Older turns go in as plain text;
  // re-sending old sources blew up input tokens for long chats.
  const messages: Anthropic.MessageParam[] = turns.slice(0, -1).map((t) => ({ role: t.role, content: t.content }));
  messages.push({ role: "user", content: `${formatSources(retrieved)}\n\n${last.content}` });

  const stream = opts.client.messages.stream(
    {
      model: opts.model ?? chatModel(),
      max_tokens: 4096,
      system: systemPrompt(opts.promptVersion ?? promptVersion()),
      // low effort: time to first token matters more here than depth, and
      // the answers are mostly lookup + rephrase
      output_config: { effort: "low" },
      messages,
    },
    { signal: opts.signal },
  );

  let ttftMs: number | null = null;
  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      ttftMs ??= Date.now() - started;
      yield { type: "text", text: event.delta.text };
    }
  }

  const final = await stream.finalMessage();
  yield {
    type: "done",
    stopReason: final.stop_reason,
    usage: { inputTokens: final.usage.input_tokens, outputTokens: final.usage.output_tokens },
    ttftMs,
    ms: Date.now() - started,
  };
}

export async function answerText(turns: ChatTurn[], opts: AnswerOptions) {
  let text = "";
  let sources: Source[] = [];
  let done: Extract<AnswerEvent, { type: "done" }> | null = null;
  for await (const ev of answer(turns, opts)) {
    if (ev.type === "text") text += ev.text;
    else if (ev.type === "sources") sources = ev.sources;
    else if (ev.type === "done") done = ev;
    else if (ev.type === "error") throw new Error(ev.message);
  }
  return { text, sources, done };
}
