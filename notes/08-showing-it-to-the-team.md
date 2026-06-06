# showing it to the team

Demoed both things at the frontend sync. Rough notes on the reactions, mostly for me.

Reviewer:
- General vibe: fine as long as it stays quiet. Nobody wants another linter that talks. The v3 noise level is "ok". One person said the comments sound too confident even when wrong. Fair. Added "Automated review, treat as a second opinion" to the summary footer, might also show confidence on each comment.
- Opt-in via `ai-review` label won over running on every PR. People want control. Also way cheaper.
- Someone asked if it knows our conventions. It doesn't, it only sees the diff. Next experiment: feed it a short conventions doc (API error shape, pagination rules etc.) and see if evals move. Cases from api-conventions.md would be easy to write.
- Worry from our lead: people rubber-stamping because "the AI already looked". Don't have an answer to that except that it posts as COMMENT, never APPROVE, and that's staying that way.

docs-chat:
- More excitement about this one than the reviewer, honestly. Everyone has asked "how do I roll back" at least once.
- First question someone typed was about something not in the docs. It said it didn't know. Good. The v1 prompt would have happily made up an answer from general Next.js knowledge; v2 fixed that and the decline cases in evals check it.
- Request: link citations to the actual file in GitHub instead of showing path:line. Easy, should do.
- Real blocker for rollout: docs are out of date in places, and the bot quotes them confidently. It's making stale docs more visible, which is probably good long-term but annoying right now.

What I think I've learned so far, 5 weeks in:
- the model part is the smallest part. Diff parsing, chunking, line mapping, budgets, retries, UI streaming, evals: that's where the time went.
- start with evals, even 5 cases. I wasted a week reading outputs by hand.
- precision over recall for anything that posts where humans read.
- keep it boring. sqlite + cosine in a for loop is fine. A YAML file of test cases is fine.

Next: conventions doc experiment for the reviewer, 30 reviewer cases, Voyage vs local on the real docs corpus with proper numbers, citation links.
