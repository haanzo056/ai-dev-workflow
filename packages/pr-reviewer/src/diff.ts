import type { DiffLine, FileDiff, FileStatus, Hunk } from "./types.js";

const HUNK_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/;

function stripPrefix(p: string): string {
  if (p === "/dev/null") return p;
  return p.replace(/^[ab]\//, "");
}

// Parses `git diff` / GitHub .diff output. Doesn't try to handle combined
// (merge) diffs, GitHub never sends those for PRs.
export function parseUnifiedDiff(text: string): FileDiff[] {
  const files: FileDiff[] = [];
  const lines = text.replace(/\r\n/g, "\n").split("\n");

  let file: FileDiff | null = null;
  let hunk: Hunk | null = null;
  let oldLine = 0;
  let newLine = 0;
  let oldLeft = 0;
  let newLeft = 0;

  const pushFile = () => {
    if (file) files.push(file);
    file = null;
    hunk = null;
  };

  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      pushFile();
      const m = /^diff --git a\/(.+) b\/(.+)$/.exec(line);
      const path = m?.[2] ?? "";
      file = { path, oldPath: m?.[1] ?? path, status: "modified", binary: false, hunks: [] };
      continue;
    }
    if (!file) continue;
    const f: FileDiff = file;

    if (!hunk) {
      if (line.startsWith("new file mode")) f.status = "added";
      else if (line.startsWith("deleted file mode")) f.status = "deleted";
      else if (line.startsWith("rename from ")) {
        f.status = "renamed";
        f.oldPath = line.slice("rename from ".length);
      } else if (line.startsWith("rename to ")) f.path = line.slice("rename to ".length);
      else if (line.startsWith("Binary files ") || line === "GIT binary patch") f.binary = true;
      else if (line.startsWith("--- ")) {
        const p = stripPrefix(line.slice(4).trim());
        if (p === "/dev/null") f.status = "added";
        else f.oldPath = p;
      } else if (line.startsWith("+++ ")) {
        const p = stripPrefix(line.slice(4).trim());
        if (p === "/dev/null") f.status = "deleted";
        else f.path = p;
      }
    }

    const hm = HUNK_RE.exec(line);
    if (hm) {
      hunk = {
        header: line,
        oldStart: Number(hm[1]),
        oldLines: hm[2] === undefined ? 1 : Number(hm[2]),
        newStart: Number(hm[3]),
        newLines: hm[4] === undefined ? 1 : Number(hm[4]),
        lines: [],
      };
      f.hunks.push(hunk);
      oldLine = hunk.oldStart;
      newLine = hunk.newStart;
      oldLeft = hunk.oldLines;
      newLeft = hunk.newLines;
      continue;
    }
    if (!hunk) continue;
    const h: Hunk = hunk;

    let dl: DiffLine | null = null;
    if (line.startsWith("+")) {
      dl = { kind: "add", content: line.slice(1), newLine: newLine++ };
      newLeft--;
    } else if (line.startsWith("-")) {
      dl = { kind: "del", content: line.slice(1), oldLine: oldLine++ };
      oldLeft--;
    } else if (line.startsWith(" ") || (line === "" && oldLeft > 0 && newLeft > 0)) {
      // the "" case: some editors strip the single space on empty context lines
      dl = { kind: "context", content: line.slice(1), oldLine: oldLine++, newLine: newLine++ };
      oldLeft--;
      newLeft--;
    }
    // "\ No newline at end of file" and anything else is ignored
    if (dl) h.lines.push(dl);
  }
  pushFile();

  return files.map((f) => ({ ...f, status: inferStatus(f) }));
}

function inferStatus(f: FileDiff): FileStatus {
  if (f.status !== "modified") return f.status;
  return f.oldPath !== f.path ? "renamed" : "modified";
}

// Lines on the RIGHT side that GitHub will accept a review comment on.
export function commentableLines(file: FileDiff): Set<number> {
  const set = new Set<number>();
  for (const h of file.hunks) {
    for (const l of h.lines) {
      if (l.newLine !== undefined) set.add(l.newLine);
    }
  }
  return set;
}

export function renderHunk(h: Hunk): string {
  const out = [h.header];
  for (const l of h.lines) {
    const prefix = l.kind === "add" ? "+" : l.kind === "del" ? "-" : " ";
    // line numbers inline so the model can reference them without counting
    const num = l.newLine !== undefined ? String(l.newLine).padStart(5) : "     ";
    out.push(`${num} ${prefix}${l.content}`);
  }
  return out.join("\n");
}

export function renderFile(f: FileDiff, hunks: Hunk[] = f.hunks): string {
  const head =
    f.status === "renamed" ? `### ${f.oldPath} -> ${f.path} (renamed)` : `### ${f.path} (${f.status})`;
  return [head, ...hunks.map(renderHunk)].join("\n");
}
