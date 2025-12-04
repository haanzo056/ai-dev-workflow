import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { commentableLines, parseUnifiedDiff, renderHunk } from "../src/diff.js";

const fixture = readFileSync(new URL("./fixtures/small.diff", import.meta.url), "utf8");

describe("parseUnifiedDiff", () => {
  const files = parseUnifiedDiff(fixture);

  it("finds every file", () => {
    expect(files.map((f) => f.path)).toEqual([
      "src/hooks/useDebounce.ts",
      "src/api/users.ts",
      "src/old/legacy.ts",
      "src/lib/format.ts",
      "public/logo.png",
    ]);
  });

  it("detects status", () => {
    expect(files.map((f) => f.status)).toEqual(["modified", "added", "deleted", "renamed", "modified"]);
    expect(files[3]!.oldPath).toBe("src/utils/format.ts");
    expect(files[4]!.binary).toBe(true);
  });

  it("tracks new-file line numbers through adds and deletes", () => {
    const hunk = files[0]!.hunks[0]!;
    const added = hunk.lines.filter((l) => l.kind === "add").map((l) => l.newLine);
    expect(added).toEqual([7, 8, 9, 14]);
    const deleted = hunk.lines.filter((l) => l.kind === "del").map((l) => l.oldLine);
    expect(deleted).toEqual([7, 8]);
  });

  it("treats a bare empty line inside a hunk as context", () => {
    const hunk = files[0]!.hunks[0]!;
    // line 2 of the fixture file is an empty context line written as " "
    expect(hunk.lines[1]).toMatchObject({ kind: "context", newLine: 2 });

    const stripped = fixture.replace("\n \n", "\n\n");
    const again = parseUnifiedDiff(stripped)[0]!.hunks[0]!;
    expect(again.lines[1]).toMatchObject({ kind: "context", content: "", newLine: 2 });
    expect(again.lines.at(-1)).toMatchObject({ kind: "add", newLine: 14 });
  });

  it("handles hunk headers without counts", () => {
    const d = `diff --git a/a.txt b/a.txt
--- a/a.txt
+++ b/a.txt
@@ -1 +1 @@
-old
+new
`;
    const [f] = parseUnifiedDiff(d);
    expect(f!.hunks[0]).toMatchObject({ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1 });
  });

  it("does not mistake a deleted '-- ' line for a file header", () => {
    const d = `diff --git a/q.sql b/q.sql
--- a/q.sql
+++ b/q.sql
@@ -1,2 +1,1 @@
--- drop this comment
 select 1;
`;
    const [f] = parseUnifiedDiff(d);
    expect(f!.path).toBe("q.sql");
    expect(f!.hunks[0]!.lines[0]).toMatchObject({ kind: "del", content: "-- drop this comment" });
  });

  it("returns [] for empty input", () => {
    expect(parseUnifiedDiff("")).toEqual([]);
  });
});

describe("commentableLines", () => {
  it("includes added and context lines but not deleted ones", () => {
    const [f] = parseUnifiedDiff(fixture);
    const lines = commentableLines(f!);
    expect(lines.has(7)).toBe(true);
    expect(lines.has(1)).toBe(true);
    expect(lines.has(15)).toBe(false);
  });
});

describe("renderHunk", () => {
  it("prefixes lines with new-file numbers", () => {
    const [, users] = parseUnifiedDiff(fixture);
    const out = renderHunk(users!.hunks[0]!);
    expect(out.split("\n")[1]).toBe("    1 +export async function getUser(id: string) {");
  });
});
