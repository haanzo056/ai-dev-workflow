export interface DocChunk {
  id: string;
  path: string;
  headings: string[];
  text: string;
  startLine: number;
}

export interface ChunkerOptions {
  maxChars: number;
  minChars: number;
}

const DEFAULTS: ChunkerOptions = { maxChars: 1800, minChars: 250 };

interface Section {
  headings: string[];
  lines: string[];
  startLine: number;
}

// Splits on headings, keeps the heading trail for each section, and only
// splits a section further (on blank lines, outside code fences) if it's too
// long. Code blocks are never cut in half - a half code block retrieved on
// its own was worse than useless.
export function chunkMarkdown(path: string, source: string, opts: Partial<ChunkerOptions> = {}): DocChunk[] {
  const o = { ...DEFAULTS, ...opts };
  const sections = splitSections(stripFrontMatter(source));

  const pieces: Section[] = [];
  for (const s of sections) {
    const body = s.lines.join("\n").trim();
    if (!body) continue;
    if (body.length <= o.maxChars) pieces.push(s);
    else pieces.push(...splitLong(s, o.maxChars));
  }

  // merge tiny sections into the previous one when they share a parent, so a
  // two-line "### Notes" doesn't become its own chunk with no context
  const merged: Section[] = [];
  for (const p of pieces) {
    const prev = merged.at(-1);
    const size = p.lines.join("\n").trim().length;
    if (
      prev &&
      size < o.minChars &&
      sameParent(prev.headings, p.headings) &&
      prev.lines.join("\n").length + size <= o.maxChars
    ) {
      const title = p.headings.at(-1);
      prev.lines.push("", ...(title && title !== prev.headings.at(-1) ? [`**${title}**`] : []), ...p.lines);
      continue;
    }
    merged.push({ ...p, lines: [...p.lines] });
  }

  return merged.map((s, i) => ({
    id: `${path}#${i}`,
    path,
    headings: s.headings,
    text: s.lines.join("\n").trim(),
    startLine: Math.max(1, s.startLine),
  }));
}

function stripFrontMatter(src: string): { text: string; offset: number } {
  const m = /^---\n[\s\S]*?\n---\n/.exec(src);
  if (!m) return { text: src, offset: 0 };
  return { text: src.slice(m[0].length), offset: m[0].split("\n").length - 1 };
}

function splitSections({ text, offset }: { text: string; offset: number }): Section[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const sections: Section[] = [];
  const trail: string[] = [];
  let cur: Section = { headings: [], lines: [], startLine: offset };
  let inFence = false;

  lines.forEach((line, i) => {
    if (/^(```|~~~)/.test(line.trim())) inFence = !inFence;
    const h = inFence ? null : /^(#{1,4})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!h) {
      cur.lines.push(line);
      return;
    }
    sections.push(cur);
    const level = h[1]!.length;
    trail.length = level - 1;
    trail[level - 1] = h[2]!;
    cur = { headings: trail.filter(Boolean), lines: [], startLine: i + 1 + offset };
  });
  sections.push(cur);
  return sections;
}

function splitLong(s: Section, maxChars: number): Section[] {
  const blocks: { lines: string[]; start: number }[] = [];
  let block: string[] = [];
  let blockStart = s.startLine;
  let inFence = false;

  s.lines.forEach((line, i) => {
    if (/^(```|~~~)/.test(line.trim())) inFence = !inFence;
    if (!inFence && line.trim() === "" && block.length > 0) {
      blocks.push({ lines: block, start: blockStart });
      block = [];
      return;
    }
    if (block.length === 0) blockStart = s.startLine + i + 1;
    block.push(line);
  });
  if (block.length > 0) blocks.push({ lines: block, start: blockStart });

  const out: Section[] = [];
  let cur: Section | null = null;
  for (const b of blocks) {
    const size = b.lines.join("\n").length;
    if (cur && cur.lines.join("\n").length + size + 1 > maxChars) {
      out.push(cur);
      cur = null;
    }
    // TODO: a single paragraph or code block longer than maxChars stays
    // oversized. Haven't hit it outside of the changelog, which I don't index.
    if (!cur) cur = { headings: s.headings, lines: [], startLine: b.start };
    else cur.lines.push("");
    cur.lines.push(...b.lines);
  }
  if (cur) out.push(cur);
  return out;
}

function sameParent(a: string[], b: string[]): boolean {
  if (b.length === 0) return a.length === 0;
  const parent = b.slice(0, -1);
  return parent.every((h, i) => a[i] === h);
}

// What actually gets embedded. Prepending the file and heading trail made a
// big difference for short sections like "## Rollback" that mean nothing alone.
export function embeddingText(c: DocChunk): string {
  const trail = [c.path, ...c.headings].join(" > ");
  return `${trail}\n\n${c.text}`;
}
