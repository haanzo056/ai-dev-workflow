# first attempt at PR review

Goal for this week: can a model leave review comments on our PRs that are worth reading? Not replace review, just catch the dumb stuff before a human looks.

First version was ~40 lines. `git diff main...` piped in, whole thing pasted into one message, "you are an expert senior engineer, review this", print whatever comes back.

It kind of works? On a small PR (the useDebounce refactor from last sprint) it found the missing timeout cleanup immediately. That was a real bug that got through human review, so that was a nice start.

Problems, roughly in order of how annoying they were:

- Asked for a JSON array in the prompt. Got JSON most of the time. Sometimes wrapped in ```json fences, sometimes with "Here's my review:" in front, once a trailing comma. My regex-extract-the-array hack is embarrassing.
- Line numbers are wrong. Like, very wrong. It's counting lines in the diff itself, not the file, and it can't count anyway. Off by 2-10 on almost every comment. GitHub rejects review comments on lines that aren't part of the diff, so this isn't cosmetic.
- It reviews everything. Formatting, naming, "consider adding JSDoc", "consider extracting this into a helper". 11 comments on a 60 line PR, maybe 2 useful.
- A 1800-line PR (the i18n migration) just returned a very generic summary and three comments about the first file. Pretty sure it gave up on the rest.

Didn't measure anything yet, just eyeballed ~8 of my own old PRs. Next: fix the JSON thing properly, then deal with line numbers.
