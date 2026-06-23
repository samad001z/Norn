/**
 * Git-friendly export/import of memories.
 *
 * A store's durable records are serialized to a plain, human-readable JSON file
 * (by convention `<store>/.norn/memory.json`) holding text, tags, the freeform
 * project label, and timestamps — but NOT the raw embedding vectors. Vectors are
 * derivable: import regenerates them locally from `content` via the configured
 * embedder. Dropping them keeps the file small and, more importantly, diffable.
 *
 * `scope` is also omitted: it is a machine-specific absolute path that would
 * churn diffs and break portability across machines (the same reason a committed
 * `.norn` db runs with isolation off). Import re-stamps scope from the importing
 * store's own default, so a memory file moves cleanly between checkouts.
 *
 * Export is deterministic — stable key order and a stable memory ordering — so
 * re-exporting an unchanged store produces a byte-identical file and an empty
 * git diff.
 */
import type { Storage } from "./storage.js";
import type { ListOptions, Memory, RestorableMemory } from "./types.js";

/** Bumped if the on-disk shape changes in a breaking way. */
export const MEMORY_EXPORT_VERSION = 1;

/** The serialized document written to `memory.json`. */
export interface MemoryExport {
  /** Format version, for forward-compatible imports. */
  version: number;
  /** Memories in a stable order (by createdAt, then id). */
  memories: RestorableMemory[];
}

/** Project a stored memory down to the durable, portable export fields. */
function toRestorable(m: Memory): RestorableMemory {
  // Construct in a fixed key order so serialization is deterministic.
  return {
    id: m.id,
    content: m.content,
    tags: m.tags,
    project: m.project,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
  };
}

/**
 * Collect a store's memories into a {@link MemoryExport}, ordered stably so
 * re-exports diff cleanly. Pass `opts` (typically a scope filter) to export only
 * the memories visible to the current project, matching how the CLI lists them.
 */
export async function exportMemories(
  storage: Storage,
  opts?: ListOptions,
): Promise<MemoryExport> {
  const memories = (await storage.list(opts)).map(toRestorable);
  // Chronological, with id as a tiebreaker, so order never depends on how the
  // store happened to return rows.
  memories.sort((a, b) =>
    a.createdAt === b.createdAt
      ? a.id.localeCompare(b.id)
      : a.createdAt.localeCompare(b.createdAt),
  );
  return { version: MEMORY_EXPORT_VERSION, memories };
}

/**
 * Serialize an export to the exact text written to disk: pretty-printed JSON
 * with a trailing newline (so editors and git are happy). Object key order is
 * fixed by construction, so this is deterministic.
 */
export function serializeExport(exp: MemoryExport): string {
  return JSON.stringify(exp, null, 2) + "\n";
}

/** Parse and validate export text. Throws on a malformed or unsupported file. */
export function parseExport(text: string): MemoryExport {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(`memory.json is not valid JSON: ${(err as Error).message}`);
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("memory.json must be a JSON object");
  }
  const doc = parsed as { version?: unknown; memories?: unknown };
  if (doc.version !== MEMORY_EXPORT_VERSION) {
    throw new Error(
      `Unsupported memory.json version ${String(doc.version)}; expected ${MEMORY_EXPORT_VERSION}`,
    );
  }
  if (!Array.isArray(doc.memories)) {
    throw new Error("memory.json must have a `memories` array");
  }
  const memories = doc.memories.map((m, i) => validateMemory(m, i));
  return { version: MEMORY_EXPORT_VERSION, memories };
}

function validateMemory(value: unknown, index: number): RestorableMemory {
  const at = `memories[${index}]`;
  if (typeof value !== "object" || value === null) {
    throw new Error(`${at} must be an object`);
  }
  const m = value as Record<string, unknown>;
  const str = (key: string): string => {
    if (typeof m[key] !== "string") throw new Error(`${at}.${key} must be a string`);
    return m[key] as string;
  };
  const tags = m.tags ?? [];
  if (!Array.isArray(tags) || tags.some((t) => typeof t !== "string")) {
    throw new Error(`${at}.tags must be an array of strings`);
  }
  const project = m.project ?? null;
  if (project !== null && typeof project !== "string") {
    throw new Error(`${at}.project must be a string or null`);
  }
  return {
    id: str("id"),
    content: str("content"),
    tags: tags as string[],
    project: project as string | null,
    createdAt: str("createdAt"),
    updatedAt: str("updatedAt"),
  };
}

/**
 * Rebuild memories into `storage` from a parsed export, regenerating each
 * embedding from its text. Idempotent via {@link Storage.restore}'s upsert, so
 * re-importing the same file does not duplicate. Returns how many were restored.
 */
export async function importMemories(
  storage: Storage,
  exp: MemoryExport,
): Promise<{ imported: number }> {
  for (const memory of exp.memories) {
    await storage.restore(memory);
  }
  return { imported: exp.memories.length };
}
