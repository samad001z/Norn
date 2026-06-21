/**
 * Pure scoring helpers for the memory engine. Kept separate from storage so the
 * math is easy to reason about and unit-test in isolation.
 */

/** Half-life of recency: a memory this old contributes half its recency score. */
export const RECENCY_HALF_LIFE_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

/** How much recall leans on meaning vs. recency. Must sum to 1. */
export const SEMANTIC_WEIGHT = 0.7;
export const RECENCY_WEIGHT = 0.3;

/** Default token budget for a recall response. */
export const DEFAULT_TOKEN_BUDGET = 1500;

/**
 * Cosine similarity at or above which two memories are treated as the same
 * thing and deduped on write.
 */
export const DEDUPE_THRESHOLD = 0.95;

/** Cosine similarity in [0, 1] from a sqlite-vec L2 distance of unit vectors. */
export function similarityFromDistance(distance: number): number {
  return Math.max(0, Math.min(1, 1 - (distance * distance) / 2));
}

/**
 * Recency score in (0, 1]: 1 for something just touched, decaying with a fixed
 * half-life. Negative ages (clock skew) clamp to 1.
 */
export function recencyScore(ageMs: number, halfLifeMs = RECENCY_HALF_LIFE_MS): number {
  if (ageMs <= 0) return 1;
  return 2 ** (-ageMs / halfLifeMs);
}

/** Blend semantic relevance and recency into a single rank score in [0, 1]. */
export function combinedScore(semantic: number, recency: number): number {
  return SEMANTIC_WEIGHT * semantic + RECENCY_WEIGHT * recency;
}

/**
 * Rough token estimate for a piece of text. Deliberately simple (~4 chars per
 * token); good enough to keep a recall response inside a budget.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
