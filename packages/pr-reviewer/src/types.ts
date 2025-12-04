export type FileStatus = "added" | "deleted" | "modified" | "renamed";

export interface DiffLine {
  kind: "add" | "del" | "context";
  content: string;
  oldLine?: number;
  newLine?: number;
}

export interface Hunk {
  header: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
}

export interface FileDiff {
  path: string;
  oldPath: string;
  status: FileStatus;
  binary: boolean;
  hunks: Hunk[];
}

export interface Chunk {
  id: string;
  files: FileDiff[];
  text: string;
  estTokens: number;
  // set when a single file had to be split across chunks
  partOf?: { path: string; part: number; total: number };
}

export type Severity = "bug" | "risk" | "suggestion" | "nit";

export interface Finding {
  path: string;
  line: number;
  severity: Severity;
  title: string;
  body: string;
  confidence: number;
}

export interface ChunkResult {
  chunkId: string;
  findings: Finding[];
  dropped: { finding: unknown; reason: string }[];
  summary: string;
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number };
  ms: number;
}
