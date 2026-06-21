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
} from "./types.js";

export interface SqliteStorageOptions {
  /** Path to the SQLite file, or ":memory:" for an ephemeral store. */
  path?: string;
  /** Embedder used to vectorize content on write and queries on recall. */
  embedder: Embedder;
  /** Clock, injectable for tests. Defaults to the system clock. */
  now?: () => Date;
}

/** Row shape as stored in SQLite; `tags` is JSON text, timestamps are aliased. */
interface MemoryRow {
  id: string;
  content: string;
  tags: string;
  project: string | null;
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

  constructor(opts: SqliteStorageOptions) {
    this.embedder = opts.embedder;
    this.now = opts.now ?? (() => new Date());
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
    this.db.exec(
      `CREATE VIRTUAL TABLE IF NOT EXISTS memories_vec USING vec0(
        memory_id TEXT PRIMARY KEY,
        embedding FLOAT[${this.embedder.dimensions}]
      );`,
    );
  }

  private static toMemory(row: MemoryRow): Memory {
    return {
      id: row.id,
      content: row.content,
      tags: JSON.parse(row.tags) as string[],
      project: row.project,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  /** Nearest existing memory in the same project, with its similarity. */
  private nearest(
    embedding: Float32Array,
    project: string | null,
  ): { row: MemoryRow; similarity: number } | null {
    const rows = this.db
      .prepare(
        `SELECT m.id, m.content, m.tags, m.project,
                m.created_at AS createdAt, m.updated_at AS updatedAt,
                v.distance AS distance
         FROM memories_vec v
         JOIN memories m ON m.id = v.memory_id
         WHERE v.embedding MATCH ? AND k = ?
         ORDER BY v.distance`,
      )
      .all(new Uint8Array(embedding.buffer), 5) as Array<MemoryRow & { distance: number }>;

    for (const row of rows) {
      if (row.project !== project) continue;
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
    const tags = input.tags ?? [];
    const embedding = await this.embedder.embed(content);

    const duplicate = this.nearest(embedding, project);
    if (duplicate && duplicate.similarity >= DEDUPE_THRESHOLD) {
      return this.mergeIntoExisting(duplicate.row, tags);
    }

    const now = this.now().toISOString();
    const memory: Memory = {
      id: randomUUID(),
      content,
      tags,
      project,
      createdAt: now,
      updatedAt: now,
    };
    const insertMemory = this.db.prepare(
      `INSERT INTO memories (id, content, tags, project, created_at, updated_at)
       VALUES (@id, @content, @tags, @project, @createdAt, @updatedAt)`,
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
    const poolSize = Math.max(50, (limit ?? 10) * 5);
    const q = await this.embedder.embed(query);

    const rows = this.db
      .prepare(
        `SELECT m.id, m.content, m.tags, m.project,
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
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const limit = opts.limit ? "LIMIT ?" : "";
    if (opts.limit) params.push(opts.limit);

    const rows = this.db
      .prepare(
        `SELECT id, content, tags, project,
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
