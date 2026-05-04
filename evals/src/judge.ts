import type Anthropic from "@anthropic-ai/sdk";
import { loadPrompt } from "@ai-dev-workflow/pr-reviewer";
import type { JudgeResult } from "./types.js";

export interface JudgeInput {
  task: string;
  input: string;
  output: string;
  rubric: string;
}

export type Judge = (j: JudgeInput) => Promise<JudgeResult>;

const GRADE_TOOL: Anthropic.Tool = {
  name: "grade",
  description: "Record the grade for this output.",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      score: { type: "integer", enum: [1, 2, 3, 4, 5] },
      reason: { type: "string" },
    },
    required: ["score", "reason"],
    additionalProperties: false,
  },
};

export function createJudge(client: Anthropic, model: string, promptVersion = "v1"): Judge {
  const system = loadPrompt("judge", promptVersion);

  return async ({ task, input, output, rubric }) => {
    const content = [
      `<task>\n${task}\n</task>`,
      `<input>\n${input}\n</input>`,
      `<output>\n${output || "(empty)"}\n</output>`,
      `<rubric>\n${rubric}\n</rubric>`,
    ].join("\n\n");

    const res = await client.messages.create({
      model,
      max_tokens: 4000,
      system,
      tools: [GRADE_TOOL],
      output_config: { effort: "medium" },
      messages: [{ role: "user", content }],
    });

    const call = res.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (!call) {
      const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join(" ");
      throw new Error(`judge did not call grade (stop: ${res.stop_reason}): ${text.slice(0, 200)}`);
    }
    const { score, reason } = call.input as { score: number; reason: string };
    return { score, reason };
  };
}
