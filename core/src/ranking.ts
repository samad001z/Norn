/**
 * Pure scoring helpers for the memory engine. Kept separate from storage so the
 * math is easy to reason about and unit-test in isolation.
 */

import { parseMetadata } from "./metadata.js";
import type { Memory } from "./types.js";

/** Half-life of recency: a memory this old contributes half its recency score. */
export const RECENCY_HALF_LIFE_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

/** Milliseconds in a day, shared by the time-based helpers below. */
const DAY_MS = 1000 * 60 * 60 * 24;

/**
 * Idle time past which a memory is surfaced as stale for pruning. Distinct from
 * recency (a smooth ranking decay): staleness is a blunt yes/no the user acts on
 * when deciding what to forget. Age-only for now (measured from the last edit);
 * once recall tracking lands it will key off last-recalled instead.
 */
export const STALE_AFTER_MS = DAY_MS * 90; // 90 days

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

/**
 * Conflict detection is two-stage: a cheap embedding pre-filter narrows candidates,
 * then a costly NLI contradiction model judges each survivor. These two constants
 * are the stage gates.
 *
 * STAGE 1 — {@link CONFLICT_TOPICAL_GATE}: the minimum embedding similarity for a
 * pair to be worth the NLI check (and not literally the same statement). It is
 * deliberately LOW. Embeddings can't see contradiction, but they reliably separate
 * "about the same thing" from noise. It must sit below the entity-swap cases NLI
 * exists to catch — "deploy on Vercel" vs "...Railway" embeds at only ~0.44 — yet
 * above unrelated/complementary pairs, so NLI (which over-flags unrelated text as
 * contradiction) never sees them.
 *
 * STAGE 2 — {@link NLI_CONTRADICTION_THRESHOLD}: the minimum contradiction
 * probability from the NLI model to actually flag the pair.
 *
 * TUNED on scripts/eval/conflict-pairs.json (32 labelled pairs; run
 * scripts/eval-conflict-detection.mjs). At gate=0.35, nli=0.50: recall 100% (18/18
 * contradictions — every entity/value/order/negation swap), precision 95%. The
 * gate is 0.35 (not 0.30) because it drops a borderline complementary pair at 0.32
 * while leaving a ~0.09 margin under the lowest true contradiction (0.44). NLI
 * stays 0.50: real contradictions cluster ≥0.79 and topical non-conflicts ~0.00,
 * so the cut is wide and the fixture doesn't pin it precisely — 0.50 is the
 * conservative middle. One residual false positive ("bearer tokens" vs "returns
 * JSON", NLI 0.91) is above any sane gate — an NLI limitation the "possible /
 * keep both" UI must absorb, not a threshold to chase. Re-tune as the fixture grows.
 */
export const CONFLICT_TOPICAL_GATE = 0.35;
export const NLI_CONTRADICTION_THRESHOLD = 0.5;

/**
 * Stage 1 predicate: is this pair worth the NLI check? Topically related enough
 * (≥ {@link CONFLICT_TOPICAL_GATE}) AND not literally the same statement (a
 * duplicate, handled by dedupe). Pure and trivially testable; `sameStatement` is
 * supplied by the caller (text comparison lives in text.ts).
 */
export function passesTopicalGate(similarity: number, sameStatement: boolean): boolean {
  return similarity >= CONFLICT_TOPICAL_GATE && !sameStatement;
}

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

/** A memory's idle time, and whether that crosses the staleness line. */
export interface Staleness {
  /** Whole days since the memory was last touched (floored, never negative). */
  idleDays: number;
  /** True once idle time reaches {@link STALE_AFTER_MS} — a prune candidate. */
  isStale: boolean;
}

/**
 * Classify a memory's idle time. Takes the age in ms (now − last touched) so it
 * stays a pure function, like the scores above; callers derive the age from
 * `updatedAt`. Clock skew (negative age) clamps to "just touched".
 */
export function staleness(ageMs: number, staleAfterMs = STALE_AFTER_MS): Staleness {
  const idle = Math.max(0, ageMs);
  return { idleDays: Math.floor(idle / DAY_MS), isStale: idle >= staleAfterMs };
}

/** A memory's computed freshness level — a read-time hint, never stored. */
export type StalenessLevel = "fresh" | "aging" | "stale";

/**
 * Idle time under which a memory is "fresh". At/above {@link STALE_AFTER_MS} it
 * is "stale"; in between it is "aging". Three coarse buckets the user can act on,
 * not a continuous score.
 */
export const FRESH_WITHIN_MS = DAY_MS * 30; // 30 days

/**
 * Recalled this many times or more, a memory is treated as a keeper and stays
 * fresh regardless of age — the user keeps coming back to it, so it earns its
 * place. Deliberately low and blunt: "I've leaned on this 5+ times" is signal
 * enough not to nag about pruning it.
 */
export const KEEP_FRESH_RECALL_COUNT = 5;

/**
 * Classify how stale a memory looks *right now*. A read-time, never-stored signal
 * the dashboard/list shows so a human decides what to prune. Pure: it only reads
 * the memory's timestamps and recall stats and returns a level — it writes nothing.
 *
 * The rule, in plain words (a human should read this and agree):
 *   1. Idle time is measured from the last time the memory was *active* — whichever
 *      is more recent, its last edit (`updatedAt`) or its last recall. Using a
 *      memory keeps it fresh; a never-recalled one falls back to its edit time, so
 *      "old AND never recalled" drifts to stale on its own (the stronger signal),
 *      while "old BUT recently recalled" reads as fresh.
 *   2. A memory recalled {@link KEEP_FRESH_RECALL_COUNT}+ times is a keeper: fresh
 *      no matter how old.
 *   3. Otherwise bucket by idle time: < 30 days fresh, < 90 days aging, else stale.
 */
export function stalenessScore(
  memory: Pick<Memory, "updatedAt" | "metadata">,
  now: Date,
): StalenessLevel {
  const meta = parseMetadata(memory.metadata);

  // (2) Frequently recalled — a keeper, fresh regardless of age.
  if ((meta.recall_count ?? 0) >= KEEP_FRESH_RECALL_COUNT) return "fresh";

  // (1) Idle time since the memory was last active (edited or recalled).
  const lastEdit = Date.parse(memory.updatedAt);
  const lastRecall = meta.last_recalled_at ? Date.parse(meta.last_recalled_at) : 0;
  const lastActive = Math.max(lastEdit, lastRecall);
  const idleMs = Math.max(0, now.getTime() - lastActive); // clock skew clamps to 0

  // (3) Coarse buckets.
  if (idleMs < FRESH_WITHIN_MS) return "fresh";
  if (idleMs < STALE_AFTER_MS) return "aging";
  return "stale";
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
