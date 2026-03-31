import { existsSync } from "node:fs";
import Chat from "@/components/Chat";
import { dbPath } from "@/lib/config";
import { loadIndex } from "@/lib/store";

export const dynamic = "force-dynamic";

function indexStatus(): string {
  const path = dbPath();
  if (!existsSync(path)) return "no index yet - run npm run ingest";
  try {
    const { meta, chunks } = loadIndex(path);
    return `${chunks.length} chunks from ${meta.files} files, ${meta.embedder}`;
  } catch (err) {
    return err instanceof Error ? err.message : "index unreadable";
  }
}

export default function Page() {
  return (
    <main>
      <header>
        <h1>docs-chat</h1>
        <span className="muted">{indexStatus()}</span>
      </header>
      <Chat />
    </main>
  );
}
