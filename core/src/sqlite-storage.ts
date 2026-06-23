import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import type { Embedder } from "./embeddings.js";
import type { Storage } from "./storage.js";
import {
  DEDUPE_THRESHOLD,
  DEFAULT_TOKEN_BUDGET,
  combinedScore,
  estimateTokens,
  recencyScore,
  similarityFromDistance,
} from "./ranking.js";
import type {
  ListOptions,
  Memory,
  NewMemory,
  RecallOptions,
  RecallResult,
  RestorableMemory,
} from "./types.js";

export interface SqliteStorageOptions {
  /** Path to the SQLite file, or ":memory:" for an ephemeral store. */
  path?: string;
  /** Embedder used to vectorize content on write and queries on recall. */
  embedder: Embedder;
  /**
   * Scope stamped on every write: the project root this store represents, or
   * null for a global/unscoped store. Recall/list callers pass a matching
   * `scope` filter to enforce isolation. Defaults to null.
   */
  scope?: string | null;
  /** Clock, injectable for tests. Defaults to the system clock. */
  now?: () => Date;
}

/** Row shape as stored in SQLite; `tags` is JSON text, timestamps are aliased. */
interface MemoryRow {
  id: string;
  content: string;
  tags: string;
  project: string | null;
  scope: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * SQLite + sqlite-vec implementation of {@link Storage}.
 *
 * Two tables: `memories` (the durable records the user controls) and
 * `memories_vec` (a sqlite-vec index, derivable and rebuildable from
 * `memories`). better-sqlite3 is synchronous; methods are wrapped as async to
 * satisfy the {@link Storage} contract.
 */
export class SqliteStorage implements Storage {
  private readonly db: Database.Database;
  private readonly embedder: Embedder;
  private readonly now: () => Date;
  private readonly defaultScope: string | null;

  constructor(opts: SqliteStorageOptions) {
    this.embedder = opts.embedder;
    this.now = opts.now ?? (() => new Date());
    this.defaultScope = opts.scope ?? null;
    const dbPath = opts.path ?? "norn.db";
    if (dbPath !== ":memory:") {
      mkdirSync(dirname(dbPath), { recursive: true });
    }
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    // The dashboard and MCP server may hold this file open at once; wait for a
    // concurrent writer instead of throwing SQLITE_BUSY.
    this.db.pragma("busy_timeout = 5000");
    sqliteVec.load(this.db);
    this.migrate();
  }

  private migrate(): void {
    // Fresh databases get `scope` from the start. Note: the table is created
    // without it below only for the IF NOT EXISTS no-op on old files; the
    // addScopeColumn() step backfills the column on those.
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id         TEXT PRIMARY KEY,
        content    TEXT NOT NULL,
        tags       TEXT NOT NULL DEFAULT '[]',
        project    TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_memories_project ON memories(project);
    `);
    this.addScopeColumn();
    this.db.exec(
      `CREATE INDEX IF NOT EXISTS idx_memories_scope ON memories(scope);`,
    );
    this.db.exec(
      `CREATE VIRTUAL TABLE IF NOT EXISTS memories_vec USING vec0(
        memory_id TEXT PRIMARY KEY,
        embedding FLOAT[${this.embedder.dimensions}]
      );`,
    );
  }

  /**
   * Add the `scope` column to databases created before scoping existed.
   * Idempotent and lossless: pre-existing rows keep all their data and get
   * scope = NULL, which is treated as global (visible from any scope), so no
   * memory disappears after the upgrade. SQLite has no `ADD COLUMN IF NOT
   * EXISTS`, so we probe the schema first.
   */
  private addScopeColumn(): void {
    const columns = this.db.prepare(`PRAGMA table_info(memories)`).all() as Array<{
      name: string;
    }>;
    if (!columns.some((c) => c.name === "scope")) {
      this.db.exec(`ALTER TABLE memories ADD COLUMN scope TEXT`);
    }
  }

  private static toMemory(row: MemoryRow): Memory {
    return {
      id: row.id,
      content: row.content,
      tags: JSON.parse(row.tags) as string[],
      project: row.project,
      scope: row.scope ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  /** Whether a stored row's scope is visible from `filter` (own + global). */
  private static scopeVisible(rowScope: string | null, filter: string | null): boolean {
    return rowScope === null || rowScope === filter;
  }

  /** Nearest existing memory in the same project and scope, with its similarity. */
  private nearest(
    embedding: Float32Array,
    project: string | null,
    scope: string | null,
  ): { row: MemoryRow; similarity: number } | null {
    const rows = this.db
      .prepare(
        `SELECT m.id, m.content, m.tags, m.project, m.scope,
                m.created_at AS createdAt, m.updated_at AS updatedAt,
                v.distance AS distance
         FROM memories_vec v
         JOIN memories m ON m.id = v.memory_id
         WHERE v.embedding MATCH ? AND k = ?
         ORDER BY v.distance`,
      )
      .all(new Uint8Array(embedding.buffer), 5) as Array<MemoryRow & { distance: number }>;

    for (const row of rows) {
      // Only ever merge into a memory of the same project label AND scope, so a
      // write in one project can never collapse into another's record.
      if (row.project !== project || row.scope !== scope) continue;
      const { distance, ...rest } = row;
      return { row: rest, similarity: similarityFromDistance(distance) };
    }
    return null;
  }

  /**
   * Store a new memory and index it. Near-identical content (cosine ≥
   * {@link DEDUPE_THRESHOLD}) in the same project is deduped: instead of a new
   * row, the existing memory's tags are merged and its `updatedAt` is bumped.
   */
  async remember(input: NewMemory): Promise<Memory> {
    const content = input.content.trim();
    if (!content) throw new Error("Cannot remember empty content");
    const project = input.project ?? null;
    const scope = input.scope !== undefined ? input.scope : this.defaultScope;
    const tags = input.tags ?? [];
    const embedding = await this.embedder.embed(content);

    const duplicate = this.nearest(embedding, project, scope);
    if (duplicate && duplicate.similarity >= DEDUPE_THRESHOLD) {
      return this.mergeIntoExisting(duplicate.row, tags);
    }

    const now = this.now().toISOString();
    const memory: Memory = {
      id: randomUUID(),
      content,
      tags,
      project,
      scope,
      createdAt: now,
      updatedAt: now,
    };
    const insertMemory = this.db.prepare(
      `INSERT INTO memories (id, content, tags, project, scope, created_at, updated_at)
       VALUES (@id, @content, @tags, @project, @scope, @createdAt, @updatedAt)`,
    );
    const insertVec = this.db.prepare(
      `INSERT INTO memories_vec (memory_id, embedding) VALUES (?, ?)`,
    );
    this.db.transaction(() => {
      insertMemory.run({ ...memory, tags: JSON.stringify(memory.tags) });
      insertVec.run(memory.id, new Uint8Array(embedding.buffer));
    })();

    return memory;
  }

  /** Union new tags into an existing memory and bump its timestamp. */
  private mergeIntoExisting(row: MemoryRow, newTags: string[]): Memory {
    const existing = SqliteStorage.toMemory(row);
    const tags = [...new Set([...existing.tags, ...newTags])];
    const updatedAt = this.now().toISOString();
    this.db
      .prepare(`UPDATE memories SET tags = ?, updated_at = ? WHERE id = ?`)
      .run(JSON.stringify(tags), updatedAt, existing.id);
    return { ...existing, tags, updatedAt };
  }

  /**
   * Semantic recall blended with recency, trimmed to a token budget.
   *
   * A pool of nearest neighbours is fetched by embedding distance, re-ranked by
   * {@link combinedScore} (meaning + recency), then walked in order while the
   * cumulative estimated tokens stay within `tokenBudget`. The top result is
   * always included so a match is never dropped purely for size.
   */
  async recall(query: string, opts: RecallOptions = {}): Promise<RecallResult[]> {
    const limit = opts.limit;
    const budget = opts.tokenBudget ?? DEFAULT_TOKEN_BUDGET;
    const filterProject = opts.project !== undefined;
    const filterScope = opts.scope !== undefined;
    const poolSize = Math.max(50, (limit ?? 10) * 5);
    const q = await this.embedder.embed(query);

    const rows = this.db
      .prepare(
        `SELECT m.id, m.content, m.tags, m.project, m.scope,
                m.created_at AS createdAt, m.updated_at AS updatedAt,
                v.distance AS distance
         FROM memories_vec v
         JOIN memories m ON m.id = v.memory_id
         WHERE v.embedding MATCH ? AND k = ?
         ORDER BY v.distance`,
      )
      .all(new Uint8Array(q.buffer), poolSize) as Array<MemoryRow & { distance: number }>;

    const nowMs = this.now().getTime();
    const ranked: RecallResult[] = [];
    for (const row of rows) {
      if (filterProject && row.project !== (opts.project ?? null)) continue;
      if (filterScope && !SqliteStorage.scopeVisible(row.scope, opts.scope ?? null)) continue;
      const { distance, ...rest } = row;
      const memory = SqliteStorage.toMemory(rest);
      const semantic = similarityFromDistance(distance);
      const recency = recencyScore(nowMs - Date.parse(memory.updatedAt));
      ranked.push({ ...memory, score: combinedScore(semantic, recency) });
    }
    ranked.sort((a, b) => b.score - a.score);

    const out: RecallResult[] = [];
    let used = 0;
    for (const r of ranked) {
      if (limit !== undefined && out.length >= limit) break;
      const tokens = estimateTokens(r.content);
      if (out.length > 0 && used + tokens > budget) break;
      out.push(r);
      used += tokens;
    }
    return out;
  }

  /**
   * Re-insert a memory from an export, keeping its id and timestamps and
   * recomputing its embedding from `content`. Unlike {@link remember}, it does
   * NOT dedupe or mint a new id: an import is a faithful rebuild of exact rows.
   * It upserts on id (and rebuilds the matching vector row), so importing the
   * same file twice is idempotent. Scope is stamped from this store's default,
   * not carried in the export — see {@link RestorableMemory}.
   */
  async restore(input: RestorableMemory): Promise<Memory> {
    const content = input.content.trim();
    if (!content) throw new Error("Cannot restore empty content");
    const embedding = await this.embedder.embed(content);
    const memory: Memory = {
      id: input.id,
      content,
      tags: input.tags ?? [],
      project: input.project ?? null,
      scope: this.defaultScope,
      createdAt: input.createdAt,
      updatedAt: input.updatedAt,
    };
    const upsertMemory = this.db.prepare(
      `INSERT INTO memories (id, content, tags, project, scope, created_at, updated_at)
       VALUES (@id, @content, @tags, @project, @scope, @createdAt, @updatedAt)
       ON CONFLICT(id) DO UPDATE SET
         content    = excluded.content,
         tags       = excluded.tags,
         project    = excluded.project,
         scope      = excluded.scope,
         created_at = excluded.created_at,
         updated_at = excluded.updated_at`,
    );
    const deleteVec = this.db.prepare(`DELETE FROM memories_vec WHERE memory_id = ?`);
    const insertVec = this.db.prepare(
      `INSERT INTO memories_vec (memory_id, embedding) VALUES (?, ?)`,
    );
    this.db.transaction(() => {
      upsertMemory.run({ ...memory, tags: JSON.stringify(memory.tags) });
      // vec0 has no upsert; replace the vector row so a re-import reindexes.
      deleteVec.run(memory.id);
      insertVec.run(memory.id, new Uint8Array(embedding.buffer));
    })();

    return memory;
  }

  async forget(id: string): Promise<boolean> {
    const result = this.db.transaction(() => {
      this.db.prepare(`DELETE FROM memories_vec WHERE memory_id = ?`).run(id);
      return this.db.prepare(`DELETE FROM memories WHERE id = ?`).run(id);
    })();
    return result.changes > 0;
  }

  async list(opts: ListOptions = {}): Promise<Memory[]> {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (opts.project !== undefined) {
      clauses.push(opts.project === null ? "project IS NULL" : "project = ?");
      if (opts.project !== null) params.push(opts.project);
    }
    if (opts.scope !== undefined) {
      // Own scope plus global (null), mirroring recall's scopeVisible().
      if (opts.scope === null) {
        clauses.push("scope IS NULL");
      } else {
        clauses.push("(scope IS NULL OR scope = ?)");
        params.push(opts.scope);
      }
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const limit = opts.limit ? "LIMIT ?" : "";
    if (opts.limit) params.push(opts.limit);

    const rows = this.db
      .prepare(
        `SELECT id, content, tags, project, scope,
                created_at AS createdAt, updated_at AS updatedAt
         FROM memories ${where}
         ORDER BY created_at DESC ${limit}`,
      )
      .all(...params) as MemoryRow[];
    return rows.map(SqliteStorage.toMemory);
  }

  async close(): Promise<void> {
    this.db.close();
  }
}
