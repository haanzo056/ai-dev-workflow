# too many nitpicks

Ran the reviewer (prompt v2) on 15 real PRs from the last two weeks, with permission from the authors, in dry-run mode, and went through every comment with two teammates.

Result: 6.1 comments per PR on average. We marked ~70% as "would resolve without changing anything". The noise wasn't wrong exactly, it was just not worth anyone's time:

- "consider adding error handling here" with no concrete failure
- naming suggestions
- "this could be extracted into a custom hook"
- stuff Prettier or ESLint already handles
- "make sure to add tests for this"

The scary part: people said they'd stop reading the comments after a couple of PRs like that. Which means the 2 real bugs in those 15 PRs would get ignored too. Noise isn't free, it kills the signal.

v3 prompt changes (details in prompts/CHANGELOG.md):
- explicit "do not comment on" list
- told it that it only sees the diff, so "might not handle null" style guesses should be skipped or low confidence
- defined confidence as "would a senior reviewer agree", filter below 0.6
- nits hidden by default
- "zero findings is normal and fine"

That last line did more than I expected. Before it, it seemed to feel obligated to find something.

After v3 on the same 15 PRs: 2.3 comments per PR, both real bugs still found. One decent suggestion got lost (a race in a useEffect fetch that it now rates 0.5 confidence). Tradeoff I'll take for now.

Big caveat: I checked this by reading output by hand, again. That took most of an afternoon. That's not going to scale to every prompt tweak. Need evals.
