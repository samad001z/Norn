/** A single remembered fact. The unit the user sees, searches, and forgets. */
export interface Memory {
  /** Stable identifier (UUID v4). */
  id: string;
  /** The remembered text, exactly as written. */
  content: string;
  /** Freeform labels for filtering and grouping. */
  tags: string[];
  /** Project this memory belongs to, or null for global memories. */
  project: string | null;
  /**
   * Project root the memory was written under (auto-stamped from the working
   * directory), or null for a global/unscoped memory. This is the defense-in-
   * depth isolation key: distinct from the freeform {@link project} label, it is
   * derived by Norn, not supplied by the caller. Null is treated as global and
   * is visible from any scope.
   */
  scope: string | null;
  /** ISO 8601 timestamp of first creation. */
  createdAt: string;
  /** ISO 8601 timestamp of last edit. */
  updatedAt: string;
  /**
   * Evolving "soft" signals about this memory — staleness inputs, confidence,
   * recall stats, contradiction flags — kept as one open JSON bag so new signals
   * never need a schema migration. Null means no signals recorded yet (the
   * default, and what every pre-metadata row migrates to). Reserved for things we
   * derive and display, not isolate or filter on; durable structured facts stay
   * as their own columns. Currently always null on write — tracking lands later.
   */
  metadata: Record<string, unknown> | null;
}

/** Input for {@link Storage.remember}. */
export interface NewMemory {
  content: string;
  tags?: string[];
  project?: string | null;
  /**
   * Override the storage's default scope for this write. Normally omitted: the
   * scope comes from {@link SqliteStorageOptions.scope}, set once from the
   * resolved project root. Exposed mainly for tests.
   */
  scope?: string | null;
}

/**
 * A memory being restored from an export (see {@link Storage.restore}). It
 * carries the durable, human-readable fields — but not `scope`, which is a
 * machine-specific absolute path the importing store re-stamps from its own
 * default. Embeddings are regenerated from `content`, never carried in the file.
 */
export interface RestorableMemory {
  id: string;
  content: string;
  tags: string[];
  project: string | null;
  /** ISO 8601 timestamp of first creation, preserved across export/import. */
  createdAt: string;
  /** ISO 8601 timestamp of last edit, preserved across export/import. */
  updatedAt: string;
}

/** A memory returned from a semantic search, with its relevance score. */
export interface RecallResult extends Memory {
  /** Cosine similarity in [0, 1]; higher is closer. */
  score: number;
}

/** Options for {@link Storage.recall}. */
export interface RecallOptions {
  /** Maximum number of results. Omit for no count cap (token budget still applies). */
  limit?: number;
  /** Restrict to a project label. Omit for all; pass null for global-only. */
  project?: string | null;
  /**
   * Restrict to a scope. When provided, only memories whose scope equals this
   * value OR is null (global) are returned — so a project sees its own and
   * global memories, never another project's. Omit to disable scope filtering
   * (e.g. the dashboard browsing a whole store).
   */
  scope?: string | null;
  /** Stop returning results once their estimated tokens would exceed this. */
  tokenBudget?: number;
}

/**
 * The kinds of agent action recorded in the events log. `list` is deliberately
 * excluded — a plain browse is noise, not an action worth surfacing in the feed.
 * Only writes ({@link Storage.remember}, {@link Storage.forget}) and reads that
 * consume context ({@link Storage.recall}) are logged.
 *
 * `conflict.detected` is the one non-verb kind: not an action but a finding,
 * emitted alongside the `remember` whose write landed on a near-duplicate
 * (deduped into an existing row) or was flagged as contradicting existing
 * memories. It only reports what write-time detection already decided — the
 * dedupe/flagging behavior itself is unchanged. Its detail carries
 * `{ existingId, incomingPreview, reason: "near-duplicate" | "contradiction" }`.
 */
export type EventKind = "remember" | "recall" | "forget" | "conflict.detected";

/**
 * One recorded agent action, read from the append-only `events` table. Distinct
 * from a {@link Memory}: an event is history (what happened, by whom, when), never
 * edited or deduped, and it outlives the memory it references — a `forget` event
 * remains after its `memoryId` row is gone.
 */
export interface AgentEvent {
  /**
   * Monotonic, gap-free row id (SQLite AUTOINCREMENT). Doubles as the cursor for
   * incremental reads: pass the last seen id as {@link ListEventsOptions.afterId}.
   */
  id: number;
  /** ISO 8601 timestamp of when the action happened. */
  ts: string;
  /** Identifier of the agent that acted, or null when unknown (see setAgentId). */
  agentId: string | null;
  /**
   * Model the acting agent reported (see setModel), or null when it never did —
   * the common case, since NORN_MODEL is opt-in. Derived at read time from the
   * event's detail bag (where writes record it), not its own column, so old rows
   * and stores need no migration: they simply read as null.
   */
  model: string | null;
  /** Which action this was. */
  kind: EventKind;
  /**
   * The memory this action concerns, or null when it maps to no single row (e.g.
   * a `recall` that surfaced several). Not a foreign key — the referenced memory
   * may since have been forgotten.
   */
  memoryId: string | null;
  /** Project root the action ran under (mirrors {@link Memory.scope}), or null. */
  scope: string | null;
  /** Freeform project label in play, or null. */
  project: string | null;
  /**
   * Open JSON bag of per-kind extras (query text, result count, content preview,
   * tags) — same "add signals without a migration" rationale as {@link Memory.metadata}.
   * Null when there's nothing extra to record.
   */
  detail: Record<string, unknown> | null;
}

/** Options for reading the events log. */
export interface ListEventsOptions {
  /**
   * Return only events with an id strictly greater than this. The polling cursor:
   * a reader tracks the highest id it has seen and passes it back to fetch the
   * tail. Omit to read from the beginning.
   */
  afterId?: number;
  /**
   * Restrict to a scope, with the same own-plus-global semantics as
   * {@link RecallOptions.scope}. Omit to read across all scopes.
   */
  scope?: string | null;
  /** Maximum number of events to return (newest-bounded by the query). */
  limit?: number;
}

/** Options for {@link Storage.list}. */
export interface ListOptions {
  /** Restrict to a project label. Omit for all; pass null for global-only. */
  project?: string | null;
  /**
   * Restrict to a scope, with the same own-plus-global semantics as
   * {@link RecallOptions.scope}. Omit to list across all scopes.
   */
  scope?: string | null;
  /** Maximum number of results. */
  limit?: number;
}
