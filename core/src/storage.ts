import type {
  ListOptions,
  Memory,
  NewMemory,
  RecallOptions,
  RecallResult,
  RestorableMemory,
} from "./types.js";

/**
 * The storage contract for Norn memories.
 *
 * Everything the server and dashboard touch goes through this interface, so the
 * backing store (SQLite + sqlite-vec today, a remote/pgvector store later) and
 * the embedding model can be swapped without changing callers. Methods are
 * async so a future network-backed implementation fits the same shape.
 */
export interface Storage {
  /** Store a new memory and index it for recall. */
  remember(input: NewMemory): Promise<Memory>;

  /** Semantic search: memories most relevant to `query`, best first. */
  recall(query: string, opts?: RecallOptions): Promise<RecallResult[]>;

  /** Forget a memory by id. Resolves false if no such memory existed. */
  forget(id: string): Promise<boolean>;

  /** List memories, newest first, optionally scoped to a project. */
  list(opts?: ListOptions): Promise<Memory[]>;

  /**
   * Re-insert a memory from an export, preserving its id and timestamps and
   * regenerating its embedding from `content`. Upserts by id, so re-importing
   * the same file is idempotent rather than duplicating. The store stamps its
   * own `scope`; the input carries none. Used by import; see the transfer module.
   */
  restore(memory: RestorableMemory): Promise<Memory>;

  /** Release any underlying resources (file handles, connections). */
  close(): Promise<void>;
}
