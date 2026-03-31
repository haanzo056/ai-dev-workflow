import Anthropic from "@anthropic-ai/sdk";
import { answer, type ChatTurn } from "@/lib/answer";
import { dbPath } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const client = new Anthropic();
const MAX_TURNS = 12;

function parseBody(body: unknown): ChatTurn[] | null {
  if (!body || typeof body !== "object" || !Array.isArray((body as { messages?: unknown }).messages)) return null;
  const turns: ChatTurn[] = [];
  for (const m of (body as { messages: unknown[] }).messages) {
    if (!m || typeof m !== "object") return null;
    const { role, content } = m as Record<string, unknown>;
    if ((role !== "user" && role !== "assistant") || typeof content !== "string" || !content.trim()) return null;
    turns.push({ role, content: content.slice(0, 8000) });
  }
  return turns.length > 0 ? turns.slice(-MAX_TURNS) : null;
}

export async function POST(req: Request) {
  const turns = parseBody(await req.json().catch(() => null));
  if (!turns) return Response.json({ error: "expected { messages: [{ role, content }] }" }, { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      try {
        for await (const ev of answer(turns, { client, dbPath: dbPath(), signal: req.signal })) send(ev);
      } catch (err) {
        if (!req.signal.aborted) {
          console.error("[chat]", err);
          send({ type: "error", message: err instanceof Error ? err.message : "something went wrong" });
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      // otherwise nginx in front of the staging box buffers the whole response
      "x-accel-buffering": "no",
    },
  });
}
