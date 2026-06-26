import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { HashEmbedder, SqliteStorage } from "../src/index.js";

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), "norn-scope-"));
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("scope filtering within a single db (defense in depth)", () => {
  it("recall to one scope never returns another scope's memory", async () => {
    const store = new SqliteStorage({ path: ":memory:", embedder: new HashEmbedder() });

    // Same content under two scopes: must NOT dedupe across scopes (two rows),
    // and recall in one scope must never surface the other's.
    const a = await store.remember({ content: "deploy from the main branch", scope: "/proj/a" });
    const b = await store.remember({ content: "deploy from the main branch", scope: "/proj/b" });
    assert.notEqual(a.id, b.id, "same content in different scopes is not merged");
    assert.equal((await store.list()).length, 2, "both rows persist");

    const results = await store.recall("deploy from the main branch", { scope: "/proj/a" });
    assert.ok(results.length >= 1, "the in-scope memory is found");
    assert.ok(
      results.every((r) => r.scope === "/proj/a"),
      "every result belongs to the queried scope",
    );
    assert.ok(
      !results.some((r) => r.id === b.id),
      "the other scope's memory is never returned",
    );
  });

  it("global (null-scope) memories are visible from any scope", async () => {
    const store = new SqliteStorage({ path: ":memory:", embedder: new HashEmbedder() });
    const g = await store.remember({ content: "use tabs not spaces", scope: null });

    const results = await store.recall("use tabs not spaces", { scope: "/proj/a" });
    assert.ok(
      results.some((r) => r.id === g.id),
      "a global memory surfaces for a scoped query",
    );
  });

  it("list with a scope filter returns own + global only; without it, everything", async () => {
    const store = new SqliteStorage({ path: ":memory:", embedder: new HashEmbedder() });
    await store.remember({ content: "a-note", scope: "/proj/a" });
    await store.remember({ content: "b-note", scope: "/proj/b" });
    await store.remember({ content: "global-note", scope: null });

    const all = await store.list();
    assert.equal(all.length, 3, "no filter: the whole store (dashboard view)");

    const scopedA = await store.list({ scope: "/proj/a" });
    assert.deepEqual(
      scopedA.map((m) => m.content).sort(),
      ["a-note", "global-note"],
      "scope filter: own project plus global, never /proj/b",
    );
  });

  it("the store's default scope is stamped on writes", async () => {
    const store = new SqliteStorage({
      path: ":memory:",
      embedder: new HashEmbedder(),
      scope: "/proj/default",
    });
    const m = await store.remember({ content: "stamped from the store default" });
    assert.equal(m.scope, "/proj/default");
  });
});

describe("safe migration from a pre-scope database", () => {
  it("adds the scope column without losing existing rows, treating them as global", async () => {
    const dbPath = path.join(tmp, "legacy.db");
    const embedder = new HashEmbedder();
    const iso = "2026-01-01T00:00:00.000Z";

    // Build a database with the OLD schema (no `scope` column) and one indexed
    // memory, exactly as a pre-upgrade Norn would have written it.
    const raw = new Database(dbPath);
    sqliteVec.load(raw);
    raw.exec(`
      CREATE TABLE memories (
        id         TEXT PRIMARY KEY,
        content    TEXT NOT NULL,
        tags       TEXT NOT NULL DEFAULT '[]',
        project    TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX idx_memories_project ON memories(project);
    `);
    raw.exec(
      `CREATE VIRTUAL TABLE memories_vec USING vec0(
        memory_id TEXT PRIMARY KEY,
        embedding FLOAT[${embedder.dimensions}]
      );`,
    );
    const emb = await embedder.embed("a legacy memory from before scoping");
    raw
      .prepare(
        `INSERT INTO memories (id, content, tags, project, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run("legacy-1", "a legacy memory from before scoping", "[]", "oldproj", iso, iso);
    raw
      .prepare(`INSERT INTO memories_vec (memory_id, embedding) VALUES (?, ?)`)
      .run("legacy-1", new Uint8Array(emb.buffer));
    raw.close();

    // Open with the current code: migrate() should add `scope` and leave the
    // row intact.
    const store = new SqliteStorage({ path: dbPath, embedder, scope: "/proj/current" });
    try {
      const all = await store.list();
      assert.equal(all.length, 1, "the legacy row survived migration");
      assert.equal(all[0]!.id, "legacy-1");
      assert.equal(all[0]!.content, "a legacy memory from before scoping");
      assert.equal(all[0]!.project, "oldproj", "old data preserved");
      assert.equal(all[0]!.scope, null, "legacy rows become global (scope null)");
      assert.equal(all[0]!.metadata, null, "legacy rows have no soft signals yet");

      // Legacy rows stay visible from any scope, so nothing disappears.
      const recalled = await store.recall("a legacy memory from before scoping", {
        scope: "/proj/current",
      });
      assert.ok(
        recalled.some((r) => r.id === "legacy-1"),
        "legacy memory is still recallable after upgrade",
      );

      // The schema really did gain the column.
      const cols = (store as unknown as { db: Database.Database }).db
        .prepare(`PRAGMA table_info(memories)`)
        .all() as Array<{ name: string }>;
      assert.ok(cols.some((c) => c.name === "scope"), "scope column added");
      assert.ok(cols.some((c) => c.name === "metadata"), "metadata column added");
    } finally {
      await store.close();
    }
  });

  it("migrate() is idempotent across reopens", async () => {
    const dbPath = path.join(tmp, "reopen.db");
    const embedder = new HashEmbedder();
    const s1 = new SqliteStorage({ path: dbPath, embedder, scope: "/p" });
    await s1.remember({ content: "first" });
    await s1.close();
    // Reopening runs migrate() again; it must not throw or duplicate the column.
    const s2 = new SqliteStorage({ path: dbPath, embedder, scope: "/p" });
    try {
      assert.equal((await s2.list()).length, 1);
    } finally {
      await s2.close();
    }
  });
});

describe("safe migration from a pre-metadata database", () => {
  it("adds the metadata column without losing rows; old rows survive as NULL and recall", async () => {
    const dbPath = path.join(tmp, "pre-metadata.db");
    const embedder = new HashEmbedder();
    const iso = "2026-02-01T00:00:00.000Z";

    // Build a database one version back: it already has `scope` (post-scope) but
    // NOT `metadata`, exactly as a Norn between those two upgrades would write it.
    const raw = new Database(dbPath);
    sqliteVec.load(raw);
    raw.exec(`
      CREATE TABLE memories (
        id         TEXT PRIMARY KEY,
        content    TEXT NOT NULL,
        tags       TEXT NOT NULL DEFAULT '[]',
        project    TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        scope      TEXT
      );
      CREATE INDEX idx_memories_project ON memories(project);
      CREATE INDEX idx_memories_scope ON memories(scope);
    `);
    raw.exec(
      `CREATE VIRTUAL TABLE memories_vec USING vec0(
        memory_id TEXT PRIMARY KEY,
        embedding FLOAT[${embedder.dimensions}]
      );`,
    );
    const emb = await embedder.embed("a memory from before soft signals");
    raw
      .prepare(
        `INSERT INTO memories (id, content, tags, project, created_at, updated_at, scope)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run("pre-1", "a memory from before soft signals", "[]", "proj", iso, iso, "/proj/current");
    raw
      .prepare(`INSERT INTO memories_vec (memory_id, embedding) VALUES (?, ?)`)
      .run("pre-1", new Uint8Array(emb.buffer));
    raw.close();

    // Open with the current code: migrate() should add `metadata` and leave the
    // row — including its existing scope — intact.
    const store = new SqliteStorage({ path: dbPath, embedder, scope: "/proj/current" });
    try {
      const all = await store.list();
      assert.equal(all.length, 1, "the pre-metadata row survived migration");
      assert.equal(all[0]!.id, "pre-1");
      assert.equal(all[0]!.content, "a memory from before soft signals");
      assert.equal(all[0]!.scope, "/proj/current", "existing scope preserved");
      assert.equal(all[0]!.metadata, null, "old rows have metadata NULL (no signals yet)");

      // The row is still recallable from its own scope after the upgrade.
      const recalled = await store.recall("a memory from before soft signals", {
        scope: "/proj/current",
      });
      assert.ok(
        recalled.some((r) => r.id === "pre-1"),
        "pre-metadata memory is still recallable after upgrade",
      );

      // The schema really did gain the column, and only once.
      const cols = (store as unknown as { db: Database.Database }).db
        .prepare(`PRAGMA table_info(memories)`)
        .all() as Array<{ name: string }>;
      assert.equal(
        cols.filter((c) => c.name === "metadata").length,
        1,
        "metadata column added exactly once",
      );
    } finally {
      await store.close();
    }
  });
});
