export interface Source {
  n: number;
  path: string;
  headings: string[];
  startLine: number;
  score: number;
}

const CITE_RE = /\[(\d+(?:\s*,\s*\d+)*)\]/g;

export function extractCitations(text: string): number[] {
  const found = new Set<number>();
  for (const m of text.matchAll(CITE_RE)) {
    for (const n of m[1]!.split(",")) found.add(Number(n.trim()));
  }
  return [...found].sort((a, b) => a - b);
}

export interface CitationCheck {
  cited: number[];
  invalid: number[];
  citedPaths: string[];
}

export function checkCitations(text: string, sources: Source[]): CitationCheck {
  const byN = new Map(sources.map((s) => [s.n, s]));
  const cited = extractCitations(text);
  const invalid = cited.filter((n) => !byN.has(n));
  const citedPaths = [...new Set(cited.flatMap((n) => (byN.has(n) ? [byN.get(n)!.path] : [])))];
  return { cited, invalid, citedPaths };
}

export type Segment = { type: "text"; text: string } | { type: "cite"; n: number };

// Splits an answer into text and citation markers for rendering.
export function segmentCitations(text: string): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  for (const m of text.matchAll(CITE_RE)) {
    if (m.index! > last) out.push({ type: "text", text: text.slice(last, m.index) });
    for (const n of m[1]!.split(",")) out.push({ type: "cite", n: Number(n.trim()) });
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push({ type: "text", text: text.slice(last) });
  return out;
}
