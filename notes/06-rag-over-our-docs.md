# RAG over our docs

Second experiment: a chat over our internal docs. People ask the same questions in #frontend all the time (how do I roll back, how do flags work, where do env vars go). The answers are in the docs, nobody finds them.

Setup is intentionally boring: chunk markdown by headings, embed, store in sqlite, brute-force cosine in JS, top 6 chunks into the prompt, stream the answer, cite [n].

Things I learned building it:

Chunking by heading is way better than fixed-size windows. Fixed windows split code blocks and a half code block retrieved on its own was actively misleading (someone would copy a command missing its second line). The chunker never cuts inside a fence now.

Prepending the heading trail to what gets embedded ("deployment.md > Deployment > Rollback") helped a lot. A section called "Rollback" whose body says "use Instant Rollback in the dashboard" doesn't say which app or where. With the trail it retrieves correctly for "how do I roll back the web app".

Tiny sections get merged into the previous one. Otherwise you get 40-character chunks that score high on keywords and carry no information.

Embeddings: wrote a pluggable interface. Local implementation is a feature-hashing thing (hashed unigrams + bigrams, no model). It's keyword search pretending to be vectors, but it runs offline and in CI, which made iterating on the rest easy. Voyage is the real option. On my 10 rag eval questions, local retrieved the right doc for 7, Voyage for 10. The 3 misses were all paraphrases ("go back to the previous version" vs "rollback").

Brute force search: ~1500 chunks from our real docs, a query takes a few ms. No vector DB needed at this size. Might revisit if we index all the ADRs and READMEs from every repo.

Follow-up questions retrieve garbage. "and the worker?" alone matches nothing. Current hack: if the last question is short, prepend the previous user question to the retrieval query. Crude, fixes most cases. A proper query-rewrite call would be better but adds latency, haven't tested.

Streaming bug that took me too long: answers sometimes lost words or stopped early, only on staging. My client split each network chunk on "\n" and JSON.parsed each line, swallowing parse errors. Behind nginx the chunks are bigger and split mid-line, so partial lines got thrown away. Fix: keep a buffer across reads, only parse complete lines, decode with `{ stream: true }`. Also `X-Accel-Buffering: no` so nginx doesn't hold the whole response. Classic, I've written this exact bug before in a different project.

Not using the API's native citations feature yet (document blocks with citations enabled). The [n] approach works and is easy to check in evals. Want to compare at some point.
