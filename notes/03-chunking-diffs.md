# chunking diffs

Big PRs were the next problem. Two issues really: quality drops a lot when the diff is huge (it reviews the first few files carefully and then skims), and one giant request is a single point of failure.

What I ended up with:

- parse the diff into files and hunks myself (parseUnifiedDiff, ~100 lines, tested against some gnarly real diffs)
- skip lockfiles, snapshots, minified stuff, binaries, deleted files. package-lock alone was 60% of the tokens on some PRs. lol.
- one chunk per file, but pack small files together up to a token limit. One request per 3-line change was mostly paying for the system prompt again and again.
- a file bigger than the limit gets split by hunks, and the prompt says "this is part 2 of 3 of foo.ts"

Tried splitting by fixed line count first. Bad idea, it cut hunks in half and the model commented on "missing" code that was just in the next chunk.

Token estimate: started with chars/4. Compared against the count_tokens endpoint on 10 real PRs and chars/4 undercounts code by 15-25%. Lots of short symbols, brackets, indentation. chars/3.2 is close enough. Not calling count_tokens for every chunk, it's an extra round trip per chunk and an estimate is fine for budgeting.

Chunk limit is 12k tokens right now. I tried 4k, 12k and 30k on the same 6 PRs. 4k: more cross-file false positives ("function X is not defined" when it's in another chunk). 30k: back to skimming. 12k felt best but this is 6 PRs, so, vibes with numbers attached.

Known gap: cross-file issues. If you change a function signature in one file and a caller in another chunk, nobody sees both. Not solving that now. Maybe a cheap first pass that summarizes the whole PR and gets passed to every chunk? TODO.

Also added:
- a token budget per run (default 200k). Chunks that don't fit get listed in the summary as "not reviewed" instead of silently vanishing.
- retries with backoff + jitter on 429/5xx/529, respecting retry-after.
- concurrency 3. Higher didn't help, just hit rate limits sooner.
