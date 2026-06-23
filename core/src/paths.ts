import os from "node:os";
import path from "node:path";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";

/** Directory name that marks a project-local Norn store, e.g. `<repo>/.norn`. */
export const NORN_DIR = ".norn";
/** The SQLite filename inside a Norn store directory. */
export const DB_FILENAME = "norn.db";
/** The git-friendly export filename, written beside the db, e.g. `.norn/memory.json`. */
export const MEMORY_EXPORT_FILENAME = "memory.json";

/**
 * The export file path for a given store: `memory.json` beside the db file. The
 * human-readable, committable sibling of the binary `norn.db`.
 */
export function memoryExportPath(dbPath: string): string {
  return path.join(path.dirname(dbPath), MEMORY_EXPORT_FILENAME);
}

/**
 * The global, user-wide store location. Used when no project-local store is
 * found and `NORN_DB_PATH` is unset. Override with the `NORN_DB_PATH`
 * environment variable.
 */
export function defaultDbPath(): string {
  return process.env.NORN_DB_PATH ?? path.join(os.homedir(), NORN_DIR, DB_FILENAME);
}

/**
 * Find the nearest project-local store by walking up from `cwd`, like git or
 * npm locate their roots. Returns the path to `<dir>/.norn/norn.db` for the
 * closest ancestor that contains a `.norn` directory, or null if none is found.
 */
export function findProjectDbPath(cwd: string = process.cwd()): string | null {
  // The global store lives at ~/.norn. Skip the home directory so it is never
  // mistaken for a project store — otherwise every directory under home would
  // "discover" the global store as if it were a project.
  const home = path.resolve(os.homedir());
  let dir = path.resolve(cwd);
  // Walk to the filesystem root, which path.dirname reports as itself.
  for (;;) {
    if (dir !== home && existsSync(path.join(dir, NORN_DIR))) {
      return path.join(dir, NORN_DIR, DB_FILENAME);
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * Resolve which store to open, in priority order:
 *
 *   1. `NORN_DB_PATH` if set — an explicit override always wins.
 *   2. The nearest project-local `.norn/norn.db` walking up from `cwd`, so a
 *      memory committed alongside a repo is used when working inside it.
 *   3. The global {@link defaultDbPath} — preserving the original behavior for
 *      anyone who has not opted a project in with `initProjectStore`.
 *
 * The server, CLI, and dashboard all resolve here, so they agree on the store
 * for whichever project they are launched in.
 */
export function resolveDbPath(cwd: string = process.cwd()): string {
  if (process.env.NORN_DB_PATH) return process.env.NORN_DB_PATH;
  return findProjectDbPath(cwd) ?? defaultDbPath();
}

/**
 * Identify the project root for `cwd` for scoping purposes: the nearest
 * ancestor containing a `.norn` or `.git` directory (the home directory is
 * skipped, as in {@link findProjectDbPath}). Falls back to `cwd` itself, so a
 * directory that is not in any project still gets a stable, distinct scope.
 */
export function cwdProjectRoot(cwd: string = process.cwd()): string {
  const home = path.resolve(os.homedir());
  const start = path.resolve(cwd);
  let dir = start;
  for (;;) {
    if (
      dir !== home &&
      (existsSync(path.join(dir, NORN_DIR)) || existsSync(path.join(dir, ".git")))
    ) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return start;
    dir = parent;
  }
}

/** A resolved store: where to open it, what to stamp, and whether to isolate. */
export interface ResolvedStore {
  /** Path to open. */
  dbPath: string;
  /** Scope to stamp on writes (project root), or null for global/unscoped. */
  scope: string | null;
  /**
   * Whether recall/list should filter by {@link scope}. False for a dedicated
   * per-project db (the file itself is the boundary, and not filtering keeps a
   * committed db portable across machines) and for an explicit `NORN_DB_PATH`
   * override (a single pooled store, preserving the original behavior). True for
   * the shared global db, so projects don't pool into one another there.
   */
  isolate: boolean;
}

/**
 * Resolve the full store context for `cwd`: path, write scope, and whether to
 * apply scope filtering. This is the single place server, CLI, and dashboard
 * agree on per project. See {@link resolveDbPath} for path precedence.
 */
export function resolveStore(cwd: string = process.cwd()): ResolvedStore {
  if (process.env.NORN_DB_PATH) {
    return { dbPath: process.env.NORN_DB_PATH, scope: null, isolate: false };
  }
  const projectDb = findProjectDbPath(cwd);
  if (projectDb) {
    // <root>/.norn/norn.db -> <root>
    const root = path.dirname(path.dirname(projectDb));
    return { dbPath: projectDb, scope: root, isolate: false };
  }
  // Global store, shared across projects without their own .norn: stamp and
  // filter by the cwd's project root so memories stay isolated per project.
  return { dbPath: defaultDbPath(), scope: cwdProjectRoot(cwd), isolate: true };
}

/** What {@link initProjectStore} did, for the caller to report to the user. */
export interface InitResult {
  /** Path to the project store's `.norn/norn.db`. */
  dbPath: string;
  /** Whether the `.norn` directory was newly created (false if it existed). */
  created: boolean;
}

// Commit the diffable text export (memory.json), ignore the binary store and
// its transient SQLite sidecars. norn.db holds embedding vectors, so it has no
// readable diffs and can conflict on merge; memory.json (not listed here) is the
// artifact you commit, and `norn import` rebuilds norn.db from it on each clone.
const STORE_GITIGNORE = `# Norn project memory: commit memory.json, ignore the binary store.
# norn.db is binary SQLite (it holds embedding vectors): no readable diffs,
# and it can conflict on merge. memory.json (not listed here) is the
# diffable file you commit; the sidecars below are always transient.
norn.db
norn.db-wal
norn.db-shm
norn.db-journal
`;

/**
 * Opt a project into local memory by creating `<dir>/.norn/`. Writes a
 * `.gitignore` there that ignores the binary `norn.db` (and its transient WAL
 * sidecars) so the diffable `memory.json` export is the committed artifact —
 * matching the export/import workflow. Idempotent: re-running leaves an existing
 * db untouched and only adds the `.gitignore` if missing.
 */
export function initProjectStore(dir: string = process.cwd()): InitResult {
  const root = path.resolve(dir);
  const normDir = path.join(root, NORN_DIR);
  const created = !existsSync(normDir);
  mkdirSync(normDir, { recursive: true });

  const gitignorePath = path.join(normDir, ".gitignore");
  if (!existsSync(gitignorePath)) {
    writeFileSync(gitignorePath, STORE_GITIGNORE, "utf8");
  }

  return { dbPath: path.join(normDir, DB_FILENAME), created };
}
