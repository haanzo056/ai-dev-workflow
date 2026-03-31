"use client";

import { useRef, useState } from "react";
import { segmentCitations, type Source } from "@/lib/citations";

interface Message {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  note?: string;
  error?: string;
}

type Event =
  | { type: "sources"; sources: Source[] }
  | { type: "text"; text: string }
  | { type: "done"; stopReason: string | null; ms: number }
  | { type: "error"; message: string };

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const patchLast = (fn: (m: Message) => Message) =>
    setMessages((prev) => [...prev.slice(0, -1), fn(prev.at(-1)!)]);

  function handle(ev: Event) {
    switch (ev.type) {
      case "sources":
        patchLast((m) => ({ ...m, sources: ev.sources }));
        break;
      case "text":
        patchLast((m) => ({ ...m, content: m.content + ev.text }));
        break;
      case "done":
        if (ev.stopReason === "max_tokens") patchLast((m) => ({ ...m, note: "answer hit the length limit" }));
        break;
      case "error":
        patchLast((m) => ({ ...m, error: ev.message }));
        break;
    }
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const question = input.trim();
    if (!question || busy) return;

    const history = [...messages, { role: "user" as const, content: question }];
    setMessages([...history, { role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);
    abortRef.current = new AbortController();

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messages: history.filter((m) => m.content && !m.error).map(({ role, content }) => ({ role, content })),
        }),
        signal: abortRef.current.signal,
      });
      if (!res.ok || !res.body) throw new Error(`request failed: ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        // a network chunk can end mid-line (and mid-character), so keep the
        // tail around until the next read
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) if (line.trim()) handle(JSON.parse(line) as Event);
      }
      buf += decoder.decode();
      if (buf.trim()) handle(JSON.parse(buf) as Event);
    } catch (err) {
      if ((err as Error).name !== "AbortError") patchLast((m) => ({ ...m, error: (err as Error).message }));
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  return (
    <>
      {messages.length === 0 && (
        <p className="muted">Ask something about the docs, e.g. &quot;how do I roll back a deploy?&quot;</p>
      )}
      {messages.map((m, i) => (
        <div key={i} className={`msg ${m.role}`}>
          {m.role === "assistant" ? <Answer message={m} /> : m.content}
          {m.role === "assistant" && busy && i === messages.length - 1 && !m.content && (
            <span className="muted">thinking...</span>
          )}
        </div>
      ))}
      <form onSubmit={send}>
        <div>
          <textarea
            rows={2}
            value={input}
            placeholder="Ask about the docs"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) send(e);
            }}
          />
          {busy ? (
            <button type="button" onClick={() => abortRef.current?.abort()}>
              Stop
            </button>
          ) : (
            <button type="submit" disabled={!input.trim()}>
              Ask
            </button>
          )}
        </div>
      </form>
    </>
  );
}

function Answer({ message }: { message: Message }) {
  const sources = message.sources ?? [];
  const byN = new Map(sources.map((s) => [s.n, s]));
  const segments = segmentCitations(message.content);
  const cited = new Set(segments.flatMap((s) => (s.type === "cite" ? [s.n] : [])));

  // TODO: render markdown. Code blocks come through as plain text for now.
  return (
    <>
      {segments.map((s, i) =>
        s.type === "text" ? (
          <span key={i}>{s.text}</span>
        ) : (
          <sup key={i} title={byN.get(s.n) ? label(byN.get(s.n)!) : "unknown source"}>
            [{s.n}]
          </sup>
        ),
      )}
      {message.note && <div className="muted">{message.note}</div>}
      {message.error && <div className="error">{message.error}</div>}
      {sources.length > 0 && message.content && (
        <div className="sources">
          Sources
          <ol>
            {sources.map((s) => (
              <li key={s.n} className={cited.has(s.n) ? "cited" : undefined}>
                {label(s)} <span className="muted">({s.score})</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </>
  );
}

function label(s: Source): string {
  const heading = s.headings.at(-1);
  return `${s.path}:${s.startLine}${heading ? ` - ${heading}` : ""}`;
}
