import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import type { ContradictionScorer } from "./contradiction.js";
import type { Embedder } from "./embeddings.js";
import {
  linkConflicts,
  parseMetadata,
  serializeMetadata,
  stampRecall,
  unlinkConflicts,
} from "./metadata.js";
import type { Storage } from "./storage.js";
import {
  DEDUPE_THRESHOLD,
  DEFAULT_TOKEN_BUDGET,
  NLI_CONTRADICTION_THRESHOLD,
  combinedScore,
  estimateTokens,
  passesTopicalGate,
  recencyScore,
  similarityFromDistance,
} from "./ranking.js";
import { sameStatement } from "./text.js";
import type {
  AgentEvent,
  EventKind,
  ListEventsOptions,
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
  /**
   * Identifier of the agent whose actions are written to the events log. Normally
   * seeded here from the environment at construction, then upgraded via
   * {@link SqliteStorage.setAgentId} once a better identity is known (e.g. the MCP
   * client's name, which only arrives after `initialize`). Defaults to null; the
   * server is responsible for never leaving it plainly null in practice.
   */
  agentId?: string | null;
  /**
   * Model identity recorded alongside {@link agentId} on logged events, so the
   * feed can group activity by model as well as by agent. Same lifecycle as
   * agentId: seeded here (callers resolve it from NORN_MODEL), upgradable via
   * {@link SqliteStorage.setModel}. Defaults to null — unlike agentId there is
   * no fallback identity to mint, because an unreported model is simply unknown.
   */
  model?: string | null;
  /** Clock, injectable for tests. Defaults to the system clock. */
  now?: () => Date;
  /**
   * Flag contradictory writes as possible conflicts (stamping
   * `metadata.possible_conflict_with` on both sides for the user to resolve).
   * Off by default. When true, a {@link ContradictionScorer} MUST be supplied:
   * detection is two-stage (embedding pre-filter → NLI), and the scorer is stage
   * two. It only ever flags — it never merges, deletes, or auto-resolves.
   */
  detectConflicts?: boolean;
  /**
   * Stage-two contradiction model for conflict detection. Required when
   * {@link detectConflicts} is true; ignored otherwise. Injected (not constructed
   * here) so the heavy NLI model stays swappable and tests can stub it.
   */
  contradictionScorer?: ContradictionScorer;
}

/** Event row as stored in SQLite; `detail` is JSON text, columns are aliased. */
interface EventRow {
  id: number;
  ts: string;
  agentId: string | null;
  kind: EventKind;
  memoryId: string | null;
  scope: string | null;
  project: string | null;
  detail: string | null;
}

/** Cap on content/query text carried in an event's detail bag. */
const EVENT_PREVIEW_CHARS = 120;

/** First {@link EVENT_PREVIEW_CHARS} of `text` — events describe, never duplicate. */
function eventPreview(text: string): string {
  return text.length > EVENT_PREVIEW_CHARS ? `${text.slice(0, EVENT_PREVIEW_CHARS)}…` : text;
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
  /** JSON object of soft signals, or null when none recorded. */
  metadata: string | null;
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
  /** Mutable: env-seeded at construction, upgradable via {@link setAgentId}. */
  private agentId: string | null;
  /** Mutable: env-seeded at construction, upgradable via {@link setModel}. */
  private model: string | null;
  private readonly detectConflicts: boolean;
  private readonly contradictionScorer: ContradictionScorer | null;

  constructor(opts: SqliteStorageOptions) {
    this.embedder = opts.embedder;
    this.now = opts.now ?? (() => new Date());
    this.defaultScope = opts.scope ?? null;
    this.agentId = opts.agentId ?? null;
    this.model = opts.model ?? null;
    this.detectConflicts = opts.detectConflicts ?? false;
    this.contradictionScorer = opts.contradictionScorer ?? null;
    if (this.detectConflicts && !this.contradictionScorer) {
      throw new Error(
        "detectConflicts requires a contradictionScorer (the stage-two NLI model)",
      );
    }
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
    this.addMetadataColumn();
    this.db.exec(
      `CREATE INDEX IF NOT EXISTS idx_memories_scope ON memories(scope);`,
    );
    this.db.exec(
      `CREATE VIRTUAL TABLE IF NOT EXISTS memories_vec USING vec0(
        memory_id TEXT PRIMARY KEY,
        embedding FLOAT[${this.embedder.dimensions}]
      );`,
    );
    // Append-only activity log. Separate from `memories` (and, like memories_vec,
    // derivable-as-history / never edited): a write here must never block or fail a
    // memory write. The INTEGER AUTOINCREMENT id is a gap-free monotonic cursor that
    // readers poll with `WHERE id > ?`. No FK to memories — a `forget` event must
    // outlive the row it names.
    // TODO: retention — events is unbounded in v1; add pruning (age/count cap) later.
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        ts        TEXT NOT NULL,
        agent_id  TEXT,
        kind      TEXT NOT NULL,
        memory_id TEXT,
        scope     TEXT,
        project   TEXT,
        detail    TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_events_scope ON events(scope);
    `);
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

  /**
   * Add the nullable `metadata` column to databases created before soft signals
   * existed. Same idempotent, lossless probe-then-ALTER as {@link addScopeColumn}:
   * existing rows keep all their data and get metadata = NULL (no signals yet).
   */
  private addMetadataColumn(): void {
    const columns = this.db.prepare(`PRAGMA table_info(memories)`).all() as Array<{
      name: string;
    }>;
    if (!columns.some((c) => c.name === "metadata")) {
      this.db.exec(`ALTER TABLE memories ADD COLUMN metadata TEXT`);
    }
  }

  /**
   * Update the agent identity stamped on subsequently-logged events. The MCP
   * client's name only arrives at `initialize`, after this store is constructed,
   * so the server seeds a fallback id here at construction and calls this to
   * upgrade it once the real name is known. Affects future events only.
   */
  setAgentId(id: string | null): void {
    this.agentId = id;
  }

  /**
   * Update the model identity stamped on subsequently-logged events. Same
   * mechanism and lifecycle as {@link setAgentId}: seed at construction, upgrade
   * once a better identity is known. Affects future events only.
   */
  setModel(model: string | null): void {
    this.model = model;
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
      metadata: row.metadata ? (JSON.parse(row.metadata) as Record<string, unknown>) : null,
    };
  }

  /** Whether a stored row's scope is visible from `filter` (own + global). */
  private static scopeVisible(rowScope: string | null, filter: string | null): boolean {
    return rowScope === null || rowScope === filter;
  }

  /**
   * Append one row to the events log. Deliberately failure-proof: any error
   * (bad JSON, schema drift, busy db) is logged to stderr and swallowed, because
   * the memory tables are the source of truth and an event is only a trace of
   * them. Called both inside write transactions (remember/forget — swallowing
   * here means a logging failure can never roll the memory write back) and
   * standalone (recall), so it must never throw.
   */
  private recordEvent(e: {
    kind: EventKind;
    memoryId?: string | null;
    scope?: string | null;
    project?: string | null;
    detail?: Record<string, unknown> | null;
  }): void {
    try {
      // The model rides in the detail bag (null when unset) rather than its own
      // column — no schema migration, and pre-model rows read back identically.
      const detail = { ...(e.detail ?? {}), model: this.model };
      this.db
        .prepare(
          `INSERT INTO events (ts, agent_id, kind, memory_id, scope, project, detail)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          this.now().toISOString(),
          this.agentId,
          e.kind,
          e.memoryId ?? null,
          e.scope ?? null,
          e.project ?? null,
          JSON.stringify(detail),
        );
    } catch (err) {
      console.error(`[norn] failed to log ${e.kind} event (memory write unaffected):`, err);
    }
  }

  /**
   * Nearest existing memories in the same project and scope, each with its cosine
   * similarity, ordered closest-first. Same-project-AND-scope only, so a write in
   * one project can never collapse into or be linked against another's record.
   * Shared by dedupe (top match ≥ {@link DEDUPE_THRESHOLD}) and conflict detection
   * (matches in the {@link isPossibleConflict} band).
   */
  private similarNeighbors(
    embedding: Float32Array,
    project: string | null,
    scope: string | null,
    k = 10,
  ): Array<{ row: MemoryRow; similarity: number }> {
    const rows = this.db
      .prepare(
        `SELECT m.id, m.content, m.tags, m.project, m.scope, m.metadata,
                m.created_at AS createdAt, m.updated_at AS updatedAt,
                v.distance AS distance
         FROM memories_vec v
         JOIN memories m ON m.id = v.memory_id
         WHERE v.embedding MATCH ? AND k = ?
         ORDER BY v.distance`,
      )
      .all(new Uint8Array(embedding.buffer), k) as Array<MemoryRow & { distance: number }>;

    const out: Array<{ row: MemoryRow; similarity: number }> = [];
    for (const row of rows) {
      if (row.project !== project || row.scope !== scope) continue;
      const { distance, ...rest } = row;
      out.push({ row: rest, similarity: similarityFromDistance(distance) });
    }
    return out;
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

    const neighbors = this.similarNeighbors(embedding, project, scope);
    // A duplicate is embedding-close AND literally the same statement. The
    // sameStatement guard is the fix for silent data loss: two memories that are
    // topical twins but differ on a value ("rate limit 600" vs "...1000") are NOT
    // merged — only true restatements (case/punctuation/filler differences) are.
    const dup = neighbors.find(
      (n) => n.similarity >= DEDUPE_THRESHOLD && sameStatement(content, n.row.content),
    );
    if (dup) {
      return this.mergeIntoExisting(dup.row, tags, content);
    }

    // Not a duplicate. Two-stage conflict detection (opt-in): stage 1 is the cheap
    // embedding pre-filter above — keep only topically-related, different-statement
    // neighbours; stage 2 asks the NLI model whether each actually contradicts the
    // new memory. Flagging only — never merges, deletes, or auto-resolves.
    const conflicts: MemoryRow[] = [];
    if (this.detectConflicts && this.contradictionScorer) {
      const candidates = neighbors.filter((n) =>
        passesTopicalGate(n.similarity, sameStatement(content, n.row.content)),
      );
      for (const candidate of candidates) {
        const p = await this.contradictionScorer.contradiction(content, candidate.row.content);
        if (p >= NLI_CONTRADICTION_THRESHOLD) conflicts.push(candidate.row);
      }
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
      metadata: conflicts.length
        ? (linkConflicts({}, conflicts.map((c) => c.id)) as Record<string, unknown>)
        : null,
    };
    const insertMemory = this.db.prepare(
      `INSERT INTO memories (id, content, tags, project, scope, created_at, updated_at, metadata)
       VALUES (@id, @content, @tags, @project, @scope, @createdAt, @updatedAt, @metadata)`,
    );
    const insertVec = this.db.prepare(
      `INSERT INTO memories_vec (memory_id, embedding) VALUES (?, ?)`,
    );
    const linkBack = this.db.prepare(`UPDATE memories SET metadata = ? WHERE id = ?`);
    this.db.transaction(() => {
      insertMemory.run({
        ...memory,
        tags: JSON.stringify(memory.tags),
        metadata: serializeMetadata(parseMetadata(memory.metadata)),
      });
      insertVec.run(memory.id, new Uint8Array(embedding.buffer));
      // Symmetric link: each candidate points back at the new memory. updated_at
      // is left untouched — flagging is not an edit to the existing record.
      for (const c of conflicts) {
        const next = linkConflicts(parseMetadata(c.metadata), [memory.id]);
        linkBack.run(serializeMetadata(next), c.id);
        // One finding per flagged pair, mirroring the metadata link it reports.
        this.recordEvent({
          kind: "conflict.detected",
          memoryId: c.id,
          scope: memory.scope,
          project: memory.project,
          detail: {
            existingId: c.id,
            incomingPreview: eventPreview(content),
            reason: "contradiction",
          },
        });
      }
      // In the same transaction so the event is atomic with the memory — but
      // recordEvent swallows its own failures, so it can only ride along with a
      // committed write, never abort one.
      this.recordEvent({
        kind: "remember",
        memoryId: memory.id,
        scope: memory.scope,
        project: memory.project,
        detail: { preview: eventPreview(content) },
      });
    })();

    return memory;
  }

  /** Union new tags into an existing memory and bump its timestamp. */
  private mergeIntoExisting(row: MemoryRow, newTags: string[], incoming: string): Memory {
    const existing = SqliteStorage.toMemory(row);
    const tags = [...new Set([...existing.tags, ...newTags])];
    const updatedAt = this.now().toISOString();
    this.db.transaction(() => {
      this.db
        .prepare(`UPDATE memories SET tags = ?, updated_at = ? WHERE id = ?`)
        .run(JSON.stringify(tags), updatedAt, existing.id);
      // The detection finding, then the action it led to. Reporting only — the
      // merge above happened exactly as it always has.
      this.recordEvent({
        kind: "conflict.detected",
        memoryId: existing.id,
        scope: existing.scope,
        project: existing.project,
        detail: {
          existingId: existing.id,
          incomingPreview: eventPreview(incoming),
          reason: "near-duplicate",
        },
      });
      // Still a remember() from the agent's point of view; `deduped` tells the
      // feed it landed on an existing row instead of creating one.
      this.recordEvent({
        kind: "remember",
        memoryId: existing.id,
        scope: existing.scope,
        project: existing.project,
        detail: { preview: eventPreview(existing.content), deduped: true },
      });
    })();
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
        `SELECT m.id, m.content, m.tags, m.project, m.scope, m.metadata,
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
    this.stampRecalled(out);
    // Best-effort like stampRecalled: a read must never fail because its trace
    // couldn't be written. Zero-result recalls are logged too — the agent asked.
    this.recordEvent({
      kind: "recall",
      scope: filterScope ? (opts.scope ?? null) : this.defaultScope,
      project: opts.project ?? null,
      detail: { query: eventPreview(query), results: out.length },
    });
    return out;
  }

  /**
   * Record that recall surfaced these memories: bump `last_recalled_at` and
   * `recall_count` in each one's metadata bag. Deliberately cheap and isolated
   * so recall latency does not regress:
   *  - only the memories actually returned are touched (not the candidate pool);
   *  - all updates run in one transaction reusing a single prepared statement;
   *  - `updated_at` is never touched — a recall is an access, not an edit, so it
   *    must not disturb recency ranking or staleness;
   *  - it is best-effort: a failed stamp (read-only or busy db) is swallowed so a
   *    successful recall is never turned into an error.
   * The returned results keep their query-time metadata snapshot; recall's shape
   * and values to the caller are unchanged.
   */
  private stampRecalled(results: RecallResult[]): void {
    if (results.length === 0) return;
    const at = this.now().toISOString();
    const update = this.db.prepare(`UPDATE memories SET metadata = ? WHERE id = ?`);
    try {
      this.db.transaction(() => {
        for (const r of results) {
          const next = stampRecall(parseMetadata(r.metadata), at);
          update.run(serializeMetadata(next), r.id);
        }
      })();
    } catch {
      // Best-effort signal — never let a stamp failure break a read.
    }
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
      metadata: null,
    };
    const upsertMemory = this.db.prepare(
      // metadata is intentionally absent from the conflict update: like scope it's
      // a local, machine-derived signal the export never carries, but unlike scope
      // it accumulates (recall stats, etc.), so a re-import must not wipe it. New
      // rows get NULL; existing rows keep whatever signals they had.
      `INSERT INTO memories (id, content, tags, project, scope, created_at, updated_at, metadata)
       VALUES (@id, @content, @tags, @project, @scope, @createdAt, @updatedAt, @metadata)
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
      // Capture the row's scope/project before it's gone: the forget event must
      // land in the right project's feed, and it outlives the memory it names.
      const row = this.db
        .prepare(`SELECT scope, project FROM memories WHERE id = ?`)
        .get(id) as { scope: string | null; project: string | null } | undefined;
      this.unlinkConflictPeers(id);
      this.db.prepare(`DELETE FROM memories_vec WHERE memory_id = ?`).run(id);
      const res = this.db.prepare(`DELETE FROM memories WHERE id = ?`).run(id);
      // Only a real deletion is an action; a miss on an unknown id is not logged.
      if (res.changes > 0 && row) {
        this.recordEvent({ kind: "forget", memoryId: id, scope: row.scope, project: row.project });
      }
      return res;
    })();
    return result.changes > 0;
  }

  /**
   * Strip `id` from the `possible_conflict_with` of every memory that links to it.
   * The links are symmetric, so `id`'s own list names exactly its peers — no scan.
   * Runs inside the caller's transaction (forget / resolveConflict).
   */
  private unlinkConflictPeers(id: string): void {
    const get = this.db.prepare(`SELECT metadata FROM memories WHERE id = ?`);
    const upd = this.db.prepare(`UPDATE memories SET metadata = ? WHERE id = ?`);
    const self = get.get(id) as { metadata: string | null } | undefined;
    if (!self) return;
    const peers = parseMetadata(self.metadata).possible_conflict_with ?? [];
    for (const peer of peers) {
      const row = get.get(peer) as { metadata: string | null } | undefined;
      if (!row) continue;
      upd.run(serializeMetadata(unlinkConflicts(parseMetadata(row.metadata), [id])), peer);
    }
  }

  async resolveConflict(idA: string, idB: string): Promise<void> {
    this.db.transaction(() => {
      const get = this.db.prepare(`SELECT metadata FROM memories WHERE id = ?`);
      const upd = this.db.prepare(`UPDATE memories SET metadata = ? WHERE id = ?`);
      const sides: Array<[string, string]> = [
        [idA, idB],
        [idB, idA],
      ];
      for (const [self, other] of sides) {
        const row = get.get(self) as { metadata: string | null } | undefined;
        if (!row) continue;
        upd.run(serializeMetadata(unlinkConflicts(parseMetadata(row.metadata), [other])), self);
      }
    })();
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
        `SELECT id, content, tags, project, scope, metadata,
                created_at AS createdAt, updated_at AS updatedAt
         FROM memories ${where}
         ORDER BY created_at DESC ${limit}`,
      )
      .all(...params) as MemoryRow[];
    return rows.map(SqliteStorage.toMemory);
  }

  /**
   * Read the events log in id order (oldest first), optionally resuming after a
   * cursor. Scope filtering goes through the exact same {@link scopeVisible}
   * predicate recall uses — own scope plus global — never a separately-written
   * WHERE clause, so the activity feed can't drift from recall's isolation rules
   * and leak another project's activity. The limit is applied AFTER the scope
   * filter, so a page is never under-filled by skipped out-of-scope rows.
   */
  async listEvents(opts: ListEventsOptions = {}): Promise<AgentEvent[]> {
    const filterScope = opts.scope !== undefined;
    const rows = this.db
      .prepare(
        `SELECT id, ts, agent_id AS agentId, kind, memory_id AS memoryId, scope, project, detail
         FROM events WHERE id > ? ORDER BY id`,
      )
      .iterate(opts.afterId ?? 0) as IterableIterator<EventRow>;

    const out: AgentEvent[] = [];
    for (const row of rows) {
      if (filterScope && !SqliteStorage.scopeVisible(row.scope, opts.scope ?? null)) continue;
      const detail = row.detail ? (JSON.parse(row.detail) as Record<string, unknown>) : null;
      out.push({
        ...row,
        // Surfaced from the detail bag; rows written before models existed
        // simply read as null.
        model: typeof detail?.model === "string" ? detail.model : null,
        detail,
      });
      if (opts.limit !== undefined && out.length >= opts.limit) break;
    }
    return out;
  }

  async close(): Promise<void> {
    this.db.close();
  }
}
