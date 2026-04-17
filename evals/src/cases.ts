import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parse } from "yaml";
import { z } from "zod";

export const ReviewerCase = z.object({
  id: z.string(),
  description: z.string().optional(),
  diff: z.string().optional(),
  diff_file: z.string().optional(),
  pr_title: z.string().optional(),
  expect: z.object({
    // each entry must be matched by at least one finding
    must_find: z
      .array(
        z.object({
          path: z.string(),
          line_range: z.tuple([z.number(), z.number()]).optional(),
          severity_in: z.array(z.enum(["bug", "risk", "suggestion", "nit"])).optional(),
          keywords: z.array(z.string()).optional(),
        }),
      )
      .default([]),
    must_not_flag: z.array(z.object({ path: z.string(), line_range: z.tuple([z.number(), z.number()]).optional() })).default([]),
    max_findings: z.number().optional(),
  }),
  rubric: z.string().optional(),
});
export type ReviewerCase = z.infer<typeof ReviewerCase>;

export const RagCase = z.object({
  id: z.string(),
  question: z.string(),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })).default([]),
  expect: z.object({
    sources_include: z.array(z.string()).default([]),
    cites: z.array(z.string()).default([]),
    answer_contains: z.array(z.string()).default([]),
    answer_not_contains: z.array(z.string()).default([]),
    should_decline: z.boolean().default(false),
  }),
  rubric: z.string().optional(),
});
export type RagCase = z.infer<typeof RagCase>;

export function loadCases<T extends z.ZodTypeAny>(dir: string, schema: T): { file: string; data: z.infer<T> }[] {
  const abs = resolve(dir);
  return readdirSync(abs)
    .filter((f) => /\.ya?ml$/.test(f))
    .sort()
    .flatMap((f) => {
      const file = join(abs, f);
      const raw = parse(readFileSync(file, "utf8"));
      const list = Array.isArray(raw) ? raw : [raw];
      return list.map((item, i) => {
        const parsed = schema.safeParse(item);
        if (!parsed.success) {
          throw new Error(`${f}[${i}]: ${parsed.error.issues.map((x) => `${x.path.join(".")} ${x.message}`).join("; ")}`);
        }
        return { file, data: parsed.data };
      });
    });
}

export function resolveDiff(c: ReviewerCase, caseFile: string): string {
  if (c.diff) return c.diff;
  if (c.diff_file) return readFileSync(join(dirname(caseFile), c.diff_file), "utf8");
  throw new Error(`${c.id}: needs diff or diff_file`);
}
