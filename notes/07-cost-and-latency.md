# cost and latency

Numbers from ~2 weeks of the reviewer running on our repo (opt-in label) plus my own testing. Sonnet, prompt v3.

Reviewer:
- median PR: ~9k input tokens, ~700 output. About 2 cents.
- p90 PR: ~45k input, 3k output, 4-5 chunks. About 12 cents.
- worst so far: a 6k-line codegen PR before I added `generated/` to the ignore list. Would have been ~$1.40, the budget cut it off at 200k tokens and listed the rest as not reviewed. Budget did its job.
- wall time: 15-40s for most PRs, mostly waiting on the longest chunk since they run in parallel.

Total for the team for two weeks: under $10. Cost is not the problem. Attention is the problem (see note 04).

Things that didn't matter as much as I thought:
- prompt caching. I put cache_control on the system prompt, but the prompt is short and below the minimum cacheable size, so cache_read_input_tokens was always 0. The diff is different every time anyway. Would matter if I added a big "team conventions" doc to the system prompt, which I might.
- model choice for the reviewer. Tried Haiku for cost, it missed the stale closure and the off-by-one case in evals. Savings would be a few dollars a month. Not worth it.

Things that did matter:
- effort. Dropped reviewer effort from high to medium: evals the same within noise (0.83 vs 0.82), output tokens down ~35%, latency down about a third. Keeping medium.
- ignoring lockfiles and generated code. Biggest single cost cut.
- the retry double-up. The SDK retries 2 times by default and I had my own retry wrapper with 4 retries on top. During an overloaded period one chunk made 15 attempts. Set maxRetries: 0 on the client so my wrapper owns it.

docs-chat:
- time to first token is what people notice. With default settings it sat there for a few seconds before streaming (the model thinks first, and thinking isn't shown by default). Effort low for chat: first token in ~1-1.5s, answers not measurably worse on the rag evals. They're lookups, not puzzles.
- per question: ~3k input (sources), ~250 output. Basically free.
- latency budget: embedding the query with Voyage adds 150-300ms. Local embedder is ~1ms but worse retrieval. Keeping Voyage.

Evals: a full run of both suites with the judge is ~40 API calls, around 30 cents. Cheap enough to run on every prompt change, which is exactly the point.
