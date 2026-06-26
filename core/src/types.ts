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
