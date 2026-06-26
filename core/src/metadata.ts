/**
 * Typed accessors for a memory's `metadata` JSON bag.
 *
 * The `metadata` column is a deliberately open JSON object so new "soft" signals
 * (staleness inputs, recall stats, confidence, …) never need a schema migration.
 * This module is the ONLY place that knows the concrete keys, so callers read and
 * update signals through it instead of hand-crafting JSON. A NULL/absent column,
 * or unparseable text, is treated as an empty bag `{}`.
 */

/**
 * The known soft-signal fields. The on-disk bag may carry other keys (forward
 * compatibility); these are the ones Norn reads and writes today. Snake_case to
 * match how the signals read inside the JSON payload.
 */
export interface MemoryMetadata {
  /** ISO 8601 timestamp of the last time recall surfaced this memory. */
  last_recalled_at?: string;
  /** How many times recall has surfaced this memory. */
  recall_count?: number;
  /**
   * Ids of other memories this one *might* contradict — a suggestion for the user
   * to review, stamped symmetrically on both sides when a new memory lands close
   * to an existing one but isn't a duplicate. Never acted on automatically: the
   * user keeps A, keeps B, or keeps both. See {@link isPossibleConflict} for how
   * weak this signal is in practice.
   */
  possible_conflict_with?: string[];
}

/**
 * Parse a stored metadata value into a bag. Accepts the raw column text, an
 * already-parsed object (as it comes off a {@link Memory}), or null/undefined.
 * Never throws: malformed JSON degrades to an empty bag so a bad row can't break
 * a read path.
 */
export function parseMetadata(
  raw: string | Record<string, unknown> | null | undefined,
): MemoryMetadata {
  if (raw == null) return {};
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return typeof parsed === "object" && parsed !== null ? (parsed as MemoryMetadata) : {};
    } catch {
      return {};
    }
  }
  return raw as MemoryMetadata;
}

/**
 * Serialize a bag for storage. An empty bag stores as NULL (no signals yet), so
 * "no metadata" has a single canonical on-disk form and round-trips to null.
 */
export function serializeMetadata(meta: MemoryMetadata): string | null {
  return Object.keys(meta).length > 0 ? JSON.stringify(meta) : null;
}

/**
 * Return a new bag with one recall stamped onto it: `last_recalled_at` set to
 * `atIso` and `recall_count` incremented (treating an absent count as 0). Pure —
 * it does not mutate the input — so callers stay in control of when to persist.
 */
export function stampRecall(meta: MemoryMetadata, atIso: string): MemoryMetadata {
  return {
    ...meta,
    last_recalled_at: atIso,
    recall_count: (meta.recall_count ?? 0) + 1,
  };
}

/**
 * Return a new bag with `ids` unioned into `possible_conflict_with` (deduped,
 * insertion-ordered, self-ids the caller should already have excluded). Pure —
 * preserves every other signal. An empty result leaves the key absent so a memory
 * with no live conflicts serializes back to a clean bag.
 */
export function linkConflicts(meta: MemoryMetadata, ids: string[]): MemoryMetadata {
  const merged = [...new Set([...(meta.possible_conflict_with ?? []), ...ids])];
  if (merged.length === 0) return meta;
  return { ...meta, possible_conflict_with: merged };
}

/**
 * Inverse of {@link linkConflicts}: drop `ids` from `possible_conflict_with` (what
 * the dashboard calls when the user resolves a pair). Removes the key entirely
 * once empty so a resolved memory has no lingering conflict metadata.
 */
export function unlinkConflicts(meta: MemoryMetadata, ids: string[]): MemoryMetadata {
  const remaining = (meta.possible_conflict_with ?? []).filter((id) => !ids.includes(id));
  const { possible_conflict_with: _drop, ...rest } = meta;
  return remaining.length > 0 ? { ...rest, possible_conflict_with: remaining } : rest;
}
