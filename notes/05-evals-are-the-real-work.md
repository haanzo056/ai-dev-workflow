# evals are the real work

Everyone says this and I nodded along and then didn't do it for three weeks. Should have started here.

The harness itself took an evening. It's not much: YAML cases, run the thing, run some checks, optionally ask a model to grade against a rubric, print a table, save JSON so I can diff runs. Writing good cases is what takes forever.

For the reviewer a case is a diff plus expectations:
- must_find: path, line range, allowed severities, any-of keywords
- must_not_flag: areas where a comment is noise
- max_findings

Keywords are the fragile part. "missing await" can be phrased 10 ways. I keep adding synonyms, which feels like cheating a bit. The judge is there to catch what keywords can't.

Where the cases came from: real bugs from our PR history (the useDebounce one, a missing await, an off-by-one in pagination) and a couple of "should say nothing" diffs (prettier run, clean rename). The quiet cases matter as much as the bug cases. v2 fails both of them, v3 passes them.

LLM-as-judge notes:
- the judge needs a rubric per case. "Is this a good review?" gave 4/5 to everything.
- told it to grade against the rubric, not against what it would have written. Before that it docked points for not mentioning things the rubric didn't care about.
- scores move between identical runs. Same outputs, rerun the judge: individual cases shift by a point sometimes. The mean over 8 cases moves by about 0.1-0.2. So I treat anything under 0.1 in score delta as noise (compare.ts marks only bigger changes).
- sampling params (temperature etc.) aren't available on the newer models, so I can't just pin temperature to 0. Could run the judge 3x and take the median. Haven't, costs 3x.

Final score per case = average of check pass rate and normalized judge score. Arbitrary, but it means a response that passes checks and is still vague doesn't get a perfect score.

Current numbers, reviewer suite, 8 cases:
- prompt v2: 0.61 mean
- prompt v3: 0.83 mean

That v2 -> v3 jump is the first time I've had a number instead of a feeling. Also caught a regression the same day: I tried "be concise" in the prompt and the missing-await case dropped because the comment no longer mentioned the Promise at all, just "add await". Reverted.

8 cases is too few. Want ~30. Collecting them from real PRs is slow because I need to reconstruct the diff and write down what the right review is.
