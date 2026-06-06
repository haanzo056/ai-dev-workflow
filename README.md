# ai-dev-workflow

A sandbox where I'm figuring out how to use LLMs in our team's dev process. I'm a frontend/fullstack dev (React, Next.js, TypeScript, Node), not an ML person, so this is mostly about the engineering around the model: getting useful output, measuring it, keeping it cheap and not annoying.

Two experiments so far: an automated PR reviewer and a chat over our project docs. Everything uses Claude through the Anthropic TypeScript SDK. What I learned along the way is in `notes/`, which is probably the most interesting part.

## What's here

`packages/pr-reviewer` - CLI and GitHub Action. Takes a PR diff, parses it into files/hunks, skips lockfiles and generated code, packs files into chunks under a token limit (splitting big files by hunk), sends each chunk with the review prompt, and gets findings back through a strict tool schema. Findings are validated, mapped onto lines GitHub will accept, filtered by confidence, deduped, and posted as a single review. There's a token budget per run and retries with backoff.

`apps/docs-chat` - small Next.js App Router app for asking questions about a folder of markdown docs. The ingest script chunks by heading (never inside code blocks), embeds with a pluggable provider (a local feature-hashing embedder that needs no network, or Voyage), and writes to sqlite. Queries do brute-force cosine in JS, and answers stream back with [n] citations to source files. `sample-docs/` is a made-up but realistic set of docs to try it on.

`evals/` - YAML test cases for both, a runner that scores them with exact checks plus an optional LLM judge with per-case rubrics, prints a table and saves each run as JSON so runs can be compared (`npm run compare -w @ai-dev-workflow/evals -- --latest reviewer`).

`prompts/` - versioned prompts, loaded by version from code. `CHANGELOG.md` says what changed and why, with eval numbers where I had them.

`notes/` - learning log. Written as I went, not cleaned up much.

## Running it

Node 22+, npm workspaces.

```bash
npm install
cp .env.example .env   # add ANTHROPIC_API_KEY
npm test
```

Reviewer on a local diff:

```bash
git diff main... | npm run review -- --diff -
```

On a GitHub PR (needs `GITHUB_TOKEN`), add `--post` to actually leave the review:

```bash
npm run review -- --pr your-org/your-repo#123
```

`.github/workflows/pr-review.yml` shows the action setup. It only runs on PRs with the `ai-review` label.

Docs chat:

```bash
npm run ingest -w @ai-dev-workflow/docs-chat                          # indexes sample-docs/
npm run ingest -w @ai-dev-workflow/docs-chat -- --docs ../../../other-repo/docs
npm run dev -w @ai-dev-workflow/docs-chat                             # http://localhost:3000
```

Set `EMBEDDINGS_PROVIDER=voyage` and `VOYAGE_API_KEY` for real embeddings; re-run ingest after switching, the index remembers which embedder built it.

Evals (these call the API, a full run with the judge costs a few tens of cents):

```bash
npm run evals                          # all suites
npm run evals -- reviewer --no-judge   # checks only
npm run evals -- rag --filter decline
```

The rag suite needs an index, so run ingest first.

## Status

Reviewer is running on our main repo behind the opt-in label, prompt v3. docs-chat is a local prototype, a few people have tried it. Evals exist but the case set is small (8 reviewer, 10 rag) and I don't fully trust the judge yet.

Next up:
- give the reviewer a short team-conventions doc and see if evals move
- grow the reviewer cases to ~30, from real PRs
- cross-file context for chunked reviews (a PR-level summary passed to each chunk?)
- compare local vs Voyage retrieval on our real docs with proper numbers
- link citations to files on GitHub, render markdown in answers
