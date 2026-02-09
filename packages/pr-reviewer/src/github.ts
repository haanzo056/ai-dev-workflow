import { commentBody, findingsAsMarkdown } from "./format.js";
import type { Finding } from "./types.js";

export interface PrRef {
  owner: string;
  repo: string;
  number: number;
}

export function parsePrRef(ref: string): PrRef {
  const m = /^([\w.-]+)\/([\w.-]+)#(\d+)$/.exec(ref.trim());
  if (!m) throw new Error(`expected owner/repo#123, got "${ref}"`);
  return { owner: m[1]!, repo: m[2]!, number: Number(m[3]) };
}

export class GitHubError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export class GitHub {
  private base = process.env.GITHUB_API_URL ?? "https://api.github.com";

  constructor(private token: string) {}

  private async req(path: string, init: RequestInit & { accept?: string } = {}): Promise<Response> {
    const res = await fetch(this.base + path, {
      ...init,
      headers: {
        authorization: `Bearer ${this.token}`,
        accept: init.accept ?? "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        "content-type": "application/json",
      },
    });
    if (!res.ok) {
      throw new GitHubError(res.status, `${init.method ?? "GET"} ${path}: ${res.status} ${await res.text()}`);
    }
    return res;
  }

  async getPr(ref: PrRef): Promise<{ title: string; body: string; headSha: string }> {
    const res = await this.req(`/repos/${ref.owner}/${ref.repo}/pulls/${ref.number}`);
    const pr = (await res.json()) as { title: string; body: string | null; head: { sha: string } };
    return { title: pr.title, body: pr.body ?? "", headSha: pr.head.sha };
  }

  async getDiff(ref: PrRef): Promise<string> {
    const res = await this.req(`/repos/${ref.owner}/${ref.repo}/pulls/${ref.number}`, {
      accept: "application/vnd.github.v3.diff",
    });
    return res.text();
  }

  async postReview(ref: PrRef, headSha: string, summary: string, findings: Finding[]): Promise<void> {
    const path = `/repos/${ref.owner}/${ref.repo}/pulls/${ref.number}/reviews`;
    const comments = findings.map((f) => ({ path: f.path, line: f.line, side: "RIGHT", body: commentBody(f) }));
    try {
      await this.req(path, {
        method: "POST",
        body: JSON.stringify({ commit_id: headSha, event: "COMMENT", body: summary, comments }),
      });
    } catch (err) {
      // 422 = at least one comment points at a line GitHub doesn't consider
      // part of the diff. One bad line kills the whole review, so fall back
      // to a plain review with everything in the body.
      if (!(err instanceof GitHubError) || err.status !== 422 || findings.length === 0) throw err;
      await this.req(path, {
        method: "POST",
        body: JSON.stringify({
          commit_id: headSha,
          event: "COMMENT",
          body: `${summary}\n\n${findingsAsMarkdown(findings)}`,
        }),
      });
    }
  }
}
