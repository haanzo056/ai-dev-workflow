// Rough estimate. chars/4 is the usual rule of thumb but it undercounts code
// with lots of symbols and short identifiers; 3.2 was closer when I compared
// against count_tokens on a few of our real PRs (see notes/03).
const CHARS_PER_TOKEN = 3.2;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}
