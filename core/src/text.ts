/**
 * Lightweight text comparison used to decide whether two memories are literally
 * "the same statement" — the guard that stops embedding-based dedupe from silently
 * merging memories that are topically near-identical but factually different
 * (e.g. "rate limit is 600" vs "rate limit is 1000", which MiniLM scores ~0.955).
 *
 * Embedding similarity gets a candidate; THIS decides whether to actually merge.
 * A human can read the rule and agree: same words (ignoring case, punctuation, and
 * a few filler words), in the same order, is a duplicate. Change a number, a name,
 * or the word order, and it is NOT a duplicate — keep both.
 */

/**
 * Filler words dropped before comparison so pure rephrasings still count as the
 * same statement ("the rate limit is 600" ≡ "rate limit: 600"). Deliberately tiny
 * and closed — only words that never carry the fact itself. Numbers, nouns, and
 * verbs are always kept, so a differing value always breaks equality.
 */
const FILLER = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "to", "of", "in", "on",
  "for", "and", "it", "this", "that", "we", "our", "you", "your",
]);

/** Lowercase, strip punctuation, drop filler words → the content tokens, in order. */
export function statementTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ") // punctuation → space (Unicode-aware)
    .split(/\s+/)
    .filter((w) => w.length > 0 && !FILLER.has(w));
}

/**
 * Whether two texts are the same statement up to case, punctuation, and filler.
 * Order-sensitive on the content tokens, so "tabs over spaces" and "spaces over
 * tabs" are NOT the same statement — a reordering that flips meaning blocks the
 * merge. Conservative by design: when unsure it returns false, so the cost of a
 * miss is a duplicate kept (recoverable), never a contradiction lost (silent).
 */
export function sameStatement(a: string, b: string): boolean {
  const ta = statementTokens(a);
  const tb = statementTokens(b);
  if (ta.length !== tb.length) return false;
  for (let i = 0; i < ta.length; i++) {
    if (ta[i] !== tb[i]) return false;
  }
  return true;
}
