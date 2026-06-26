/**
 * Contradiction scoring lives behind this interface so the model is swappable
 * without touching the store — the same shape the {@link Embedder} interface uses.
 *
 * It exists because embedding similarity cannot tell a contradiction from a
 * rephrasing: "deploy on Vercel" vs "deploy on Railway" embeds at ~0.44 (looks
 * unrelated), while "deploy on Vercel from main" (a refinement, NOT a conflict)
 * embeds at ~0.87 (looks like a near-duplicate). An entailment model judges the
 * PAIR directly, which is the signal conflict detection actually needs. It is the
 * second, costly stage — only ever run on the handful of candidates an embedding
 * pre-filter already surfaced.
 */
export interface ContradictionScorer {
  /**
   * Probability in [0, 1] that statements `a` and `b` contradict each other:
   * 0 = compatible/unrelated, 1 = a direct contradiction. Implementations should
   * treat the pair symmetrically (contradiction is not directional for our use).
   */
  contradiction(a: string, b: string): Promise<number>;
}
