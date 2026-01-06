# Prompt changelog

Newest at the top within each prompt. Eval numbers are from `npm run evals` on the case set at the time, so they're only comparable within a section.

## reviewer

### v3
- Added an explicit "do not comment on" list (formatting, missing tests, vague "add error handling").
- Told it that it only sees the diff and to skip or lower confidence for things that depend on unseen code.
- Defined confidence as "would a senior reviewer agree", hide nits by default.
- Why: v2 comments were technically right but noisy. On our first week of real PRs people were resolving ~70% of comments without changes. Most were nits and "consider adding error handling". After v3, avg comments per PR went from 6.1 to 2.3 on the same 15 PRs, and the two real bugs v2 found were still found.

### v2
- Switched from JSON-in-text to the report_findings tool (structured output), so no more parsing failures.
- Line numbers are now rendered into the diff and the prompt says to use them. v1 counted lines itself and was off by 2-10 most of the time, which GitHub rejects.
- Added severity levels and team stack context.
- Why: v1 output broke JSON parsing about 1 in 8 runs (trailing prose, markdown fences) and half the line numbers were wrong.

### v1
- First try. Generic "expert reviewer" prompt, asked for a JSON array.

## docs-chat

### v2
- Answer only from the provided sources; say "The docs I have don't cover that." when they don't.
- Citations go at the end of the sentence, point out contradictions between sources.
- Sources moved into a `<sources>` block with path and heading attributes.
- Why: v1 answered "how do we configure Kubernetes autoscaling" with a confident generic HPA tutorial. We don't use Kubernetes. On the rag suite, the two decline cases went from failing to passing, overall mean 0.68 -> 0.86.

### v1
- Numbered excerpts, cite with [n].

## judge

### v1
- Grade against the per-case rubric, 1-5 scale with anchors, reason in one or two sentences.
- An earlier unversioned draft had no rubric ("is this a good review?") and gave 4 or 5 to nearly everything, so it never made it in here.
