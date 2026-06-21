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
  /** ISO 8601 timestamp of first creation. */
  createdAt: string;
  /** ISO 8601 timestamp of last edit. */
  updatedAt: string;
}

/** Input for {@link Storage.remember}. */
export interface NewMemory {
  content: string;
  tags?: string[];
  project?: string | null;
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
  /** Restrict to a project. Omit for all; pass null for global-only. */
  project?: string | null;
  /** Stop returning results once their estimated tokens would exceed this. */
  tokenBudget?: number;
}

/** Options for {@link Storage.list}. */
export interface ListOptions {
  /** Restrict to a project. Omit for all; pass null for global-only. */
  project?: string | null;
  /** Maximum number of results. */
  limit?: number;
}
