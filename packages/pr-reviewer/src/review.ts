import type Anthropic from "@anthropic-ai/sdk";
import type { Chunk } from "./types.js";

export const FINDINGS_TOOL: Anthropic.Tool = {
  name: "report_findings",
  description:
    "Report review findings for the diff. Call exactly once, with an empty findings array if there is nothing worth flagging.",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      summary: {
        type: "string",
        description: "One or two sentences on what this part of the change does and its overall risk.",
      },
      findings: {
        type: "array",
        items: {
          type: "object",
          properties: {
            path: { type: "string", description: "File path exactly as shown in the diff header." },
            line: { type: "integer", description: "Line number in the NEW file (the number shown at the start of the diff line)." },
            severity: { type: "string", enum: ["bug", "risk", "suggestion", "nit"] },
            title: { type: "string", description: "Short, specific. Under 80 chars." },
            body: { type: "string", description: "Why it's a problem and what to do instead. Markdown ok." },
            confidence: { type: "number", description: "0 to 1. How sure you are this is a real problem." },
          },
          required: ["path", "line", "severity", "title", "body", "confidence"],
          additionalProperties: false,
        },
      },
    },
    required: ["summary", "findings"],
    additionalProperties: false,
  },
};

export interface PrContext {
  title?: string;
  description?: string;
}

export interface ReviewCallOptions {
  model: string;
  system: string;
  maxOutputTokens: number;
  effort: "low" | "medium" | "high";
  pr?: PrContext;
}

export interface RawChunkReview {
  input: unknown;
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number };
  stopReason: string | null;
}

function userMessage(chunk: Chunk, pr?: PrContext): string {
  const parts: string[] = [];
  if (pr?.title) parts.push(`PR title: ${pr.title}`);
  if (pr?.description) {
    // descriptions can be huge (pasted logs, screenshots markdown); the first
    // couple thousand chars carry the intent
    parts.push(`PR description:\n${pr.description.slice(0, 2000)}`);
  }
  if (chunk.partOf) {
    parts.push(
      `Note: this is part ${chunk.partOf.part} of ${chunk.partOf.total} of ${chunk.partOf.path}. Other hunks of the same file are reviewed separately.`,
    );
  }
  parts.push("<diff>\n" + chunk.text + "\n</diff>");
  parts.push("Review the diff and call report_findings.");
  return parts.join("\n\n");
}

export async function reviewChunk(
  client: Anthropic,
  chunk: Chunk,
  opts: ReviewCallOptions,
): Promise<RawChunkReview> {
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: userMessage(chunk, opts.pr) }];
  const usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 };

  // tool_choice stays "auto": forcing the tool 400s on some newer models and
  // conflicts with thinking. The model almost always calls it anyway; if it
  // doesn't, ask once more.
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await client.messages.create({
      model: opts.model,
      max_tokens: opts.maxOutputTokens,
      system: [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }],
      tools: [FINDINGS_TOOL],
      tool_choice: { type: "auto" },
      output_config: { effort: opts.effort },
      messages,
    });
    usage.inputTokens += res.usage.input_tokens;
    usage.outputTokens += res.usage.output_tokens;
    usage.cacheReadTokens += res.usage.cache_read_input_tokens ?? 0;

    if (res.stop_reason === "refusal") {
      return { input: null, usage, stopReason: res.stop_reason };
    }

    const call = res.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === FINDINGS_TOOL.name,
    );
    // with max_tokens the tool input may be cut off, don't trust it
    if (call && res.stop_reason !== "max_tokens") {
      return { input: call.input, usage, stopReason: res.stop_reason };
    }
    if (res.stop_reason === "max_tokens") {
      return { input: null, usage, stopReason: res.stop_reason };
    }

    messages.push({ role: "assistant", content: res.content });
    messages.push({ role: "user", content: "Please report your findings with the report_findings tool." });
  }
  return { input: null, usage, stopReason: "no_tool_call" };
}
