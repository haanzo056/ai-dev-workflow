import Database from "better-sqlite3";
import { mkdirSync, statSync } from "node:fs";
import { dirname } from "node:path";
import type { DocChunk } from "./markdown-chunker";

export interface StoredChunk extends DocChunk {
  embedding: Float32Array;
}

export interface IndexMeta {
  embedder: string;
  dims: number;
  builtAt: string;
  files: number;
}

const SCHEMA = `
create table if not exists chunks (
  id text primary key,
  path text not null,
  headings text not null,
  text text not null,
  start_line integer not null,
  embedding blob not null
);
create table if not exists meta (key text primary key, value text not null);
`;

export function openDb(path: string, opts: { create?: boolean } = {}): Database.Database {
  if (opts.create) mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path, { fileMustExist: !opts.create });
  db.pragma("journal_mode = WAL");
  db.exec(SCHEMA);
  return db;
}

export function writeIndex(db: Database.Database, chunks: StoredChunk[], meta: IndexMeta): void {
  const insert = db.prepare(
    "insert into chunks (id, path, headings, text, start_line, embedding) values (?, ?, ?, ?, ?, ?)",
  );
  const setMeta = db.prepare("insert or replace into meta (key, value) values (?, ?)");

  // full rebuild every time; the docs are small and partial updates meant
  // tracking deletions, which I got wrong once already
  db.transaction(() => {
    db.exec("delete from chunks");
    for (const c of chunks) {
      insert.run(c.id, c.path, JSON.stringify(c.headings), c.text, c.startLine, toBlob(c.embedding));
    }
    setMeta.run("meta", JSON.stringify(meta));
  })();
}

export function readMeta(db: Database.Database): IndexMeta | null {
  const row = db.prepare("select value from meta where key = 'meta'").get() as { value: string } | undefined;
  return row ? (JSON.parse(row.value) as IndexMeta) : null;
}

export function readAll(db: Database.Database): StoredChunk[] {
  const rows = db.prepare("select * from chunks").all() as {
    id: string;
    path: string;
    headings: string;
    text: string;
    start_line: number;
    embedding: Buffer;
  }[];
  return rows.map((r) => ({
    id: r.id,
    path: r.path,
    headings: JSON.parse(r.headings) as string[],
    text: r.text,
    startLine: r.start_line,
    embedding: fromBlob(r.embedding),
  }));
}

function toBlob(v: Float32Array): Buffer {
  return Buffer.from(v.buffer, v.byteOffset, v.byteLength);
}

function fromBlob(b: Buffer): Float32Array {
  // copy: the Buffer can be a view into a shared pool with a non-aligned offset
  const copy = new Uint8Array(b.byteLength);
  copy.set(b);
  return new Float32Array(copy.buffer);
}

interface Loaded {
  path: string;
  mtimeMs: number;
  meta: IndexMeta;
  chunks: StoredChunk[];
}

let cache: Loaded | null = null;

// Loads the whole index into memory once, reloads if ingest rewrote the file.
export function loadIndex(path: string): Loaded {
  const mtimeMs = statSync(path).mtimeMs;
  if (cache && cache.path === path && cache.mtimeMs === mtimeMs) return cache;

  const db = openDb(path);
  try {
    const meta = readMeta(db);
    if (!meta) throw new Error(`index at ${path} has no metadata, re-run ingest`);
    cache = { path, mtimeMs, meta, chunks: readAll(db) };
    return cache;
  } finally {
    db.close();
  }
}
