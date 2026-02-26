import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { chunkMarkdown, embeddingText } from "../lib/markdown-chunker";

describe("chunkMarkdown", () => {
  it("splits on headings and keeps the heading trail", () => {
    const md = `# Deploy

Intro paragraph that is long enough to stand on its own as a chunk, more or less, we'll see.
It keeps going for a bit so it passes the minimum size for a chunk in these tests here.

## Staging

Merging to main deploys to staging. This section also needs to be long enough to not merge
into the previous one, so here is another sentence about staging deploys and migrations.

## Production

Manual deploys only, approved by on-call. Again padding this out so the chunker keeps it
as a separate section instead of merging it into the staging one above it. Almost there.
`;
    const chunks = chunkMarkdown("deploy.md", md, { minChars: 100 });
    expect(chunks.map((c) => c.headings)).toEqual([["Deploy"], ["Deploy", "Staging"], ["Deploy", "Production"]]);
    expect(chunks[1]!.text.startsWith("Merging to main")).toBe(true);
    expect(chunks[1]!.startLine).toBe(6);
    expect(chunks.map((c) => c.id)).toEqual(["deploy.md#0", "deploy.md#1", "deploy.md#2"]);
  });

  it("does not treat # inside code fences as headings", () => {
    const md = "# Setup\n\n```bash\n# install deps\npnpm install\n```\n\nThen run it.";
    const chunks = chunkMarkdown("a.md", md);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.text).toContain("# install deps");
  });

  it("merges tiny sections into the previous chunk", () => {
    const md = `# Flags

Flags are in PostHog and read through useFlag on the client and getFlag on the server. Long enough.

## Note

Short.
`;
    const chunks = chunkMarkdown("flags.md", md, { minChars: 50 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.text).toContain("**Note**");
    expect(chunks[0]!.text).toContain("Short.");
  });

  it("splits long sections on blank lines without breaking code blocks", () => {
    const para = (n: number) => `Paragraph ${n}. ` + "words ".repeat(60);
    const code = "```ts\nconst a = 1;\n\nconst b = 2;\n```";
    const md = `# Big\n\n${para(1)}\n\n${para(2)}\n\n${code}\n\n${para(3)}\n`;
    const chunks = chunkMarkdown("big.md", md, { maxChars: 700, minChars: 10 });

    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.headings).toEqual(["Big"]);
      const fences = c.text.match(/```/g)?.length ?? 0;
      expect(fences % 2).toBe(0);
    }
    expect(chunks.some((c) => c.text.includes("const a = 1;\n\nconst b = 2;"))).toBe(true);
  });

  it("strips front matter and keeps line numbers right", () => {
    const md = "---\ntitle: x\n---\n# Title\n\nBody text here.";
    const [c] = chunkMarkdown("fm.md", md);
    expect(c!.text).toBe("Body text here.");
    expect(c!.startLine).toBe(4);
  });

  it("handles the sample docs without empty or oversized chunks", () => {
    const src = readFileSync(new URL("../sample-docs/deployment.md", import.meta.url), "utf8");
    const chunks = chunkMarkdown("deployment.md", src);
    expect(chunks.length).toBeGreaterThan(3);
    for (const c of chunks) {
      expect(c.text.trim().length).toBeGreaterThan(0);
      expect(c.text.length).toBeLessThanOrEqual(1800);
    }
  });
});

describe("embeddingText", () => {
  it("prefixes path and headings", () => {
    const text = embeddingText({ id: "x", path: "deploy.md", headings: ["Deployment", "Rollback"], text: "Use Vercel.", startLine: 1 });
    expect(text).toBe("deploy.md > Deployment > Rollback\n\nUse Vercel.");
  });
});
