import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import {
  HashEmbedder,
  SqliteStorage,
  parseMetadata,
  type ContradictionScorer,
  type Embedder,
} from "../src/index.js";

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), "norn-events-"));
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function memStore(extra: Partial<ConstructorParameters<typeof SqliteStorage>[0]> = {}) {
  return new SqliteStorage({ path: ":memory:", embedder: new HashEmbedder(), ...extra });
}

describe("event recording per operation", () => {
  it("remember logs an event carrying the memory's id, scope, project, and a preview", async () => {
    const store = memStore({ scope: "/proj/a", agentId: "agent-test" });
    const long = `decided: ${"x".repeat(200)}`;
    const m = await store.remember({ content: long, project: "norn", tags: ["decision"] });

    const events = await store.listEvents();
    assert.equal(events.length, 1);
    const e = events[0]!;
    assert.equal(e.kind, "remember");
    assert.equal(e.memoryId, m.id);
    assert.equal(e.scope, "/proj/a");
    assert.equal(e.project, "norn");
    assert.equal(e.agentId, "agent-test");
    const preview = e.detail?.preview as string;
    assert.ok(preview.startsWith("decided:"), "detail carries a content preview");
    assert.ok(preview.length <= 121, "preview is capped, not the full content");
  });

  it("a deduped remember logs against the existing row with deduped: true", async () => {
    const store = memStore({ scope: "/proj/a" });
    const first = await store.remember({ content: "deploy from the main branch" });
    const second = await store.remember({ content: "Deploy from the main branch!" });
    assert.equal(second.id, first.id, "precondition: the write merged");

    const events = await store.listEvents();
    assert.deepEqual(
      events.map((e) => e.kind),
      ["remember", "conflict.detected", "remember"],
      "the merge logs its finding, then the write itself",
    );
    const merged = events[2]!;
    assert.equal(merged.memoryId, first.id);
    assert.equal(merged.detail?.deduped, true);
    assert.equal(events[0]!.detail?.deduped, undefined, "the original write is not marked");
  });

  it("forget logs with the deleted memory's scope, and the event outlives the row", async () => {
    const store = memStore({ scope: "/proj/a" });
    const m = await store.remember({ content: "temporary note", project: "norn" });
    assert.equal(await store.forget(m.id), true);

    assert.equal((await store.list()).length, 0, "the memory is gone");
    const events = await store.listEvents();
    assert.equal(events.length, 2);
    const e = events[1]!;
    assert.equal(e.kind, "forget");
    assert.equal(e.memoryId, m.id, "the event still names the forgotten memory");
    assert.equal(e.scope, "/proj/a", "stamped with the deleted row's scope, not a default");
    assert.equal(e.project, "norn");
  });

  it("forget of an unknown id logs nothing — a miss is not an action", async () => {
    const store = memStore();
    assert.equal(await store.forget("no-such-id"), false);
    assert.equal((await store.listEvents()).length, 0);
  });

  it("recall logs the query and result count, including zero-result recalls", async () => {
    const store = memStore({ scope: "/proj/a" });
    // Empty store: the agent asked and got nothing — still activity.
    await store.recall("anything remembered yet?", { scope: "/proj/a" });

    await store.remember({ content: "the api rate limit is 600 per minute" });
    const hits = await store.recall("api rate limit", { scope: "/proj/a" });
    assert.ok(hits.length >= 1, "precondition: recall found something");

    const recalls = (await store.listEvents()).filter((e) => e.kind === "recall");
    assert.equal(recalls.length, 2);
    assert.equal(recalls[0]!.detail?.results, 0, "the zero-result recall was logged");
    const e = recalls[1]!;
    assert.equal(e.detail?.query, "api rate limit");
    assert.equal(e.detail?.results, hits.length);
    assert.equal(e.memoryId, null, "a recall maps to no single memory");
    assert.equal(e.scope, "/proj/a", "stamped with the queried scope");
  });

  it("list is deliberately not logged", async () => {
    const store = memStore();
    await store.remember({ content: "something" });
    await store.list();
    await store.list({ scope: null });
    const kinds = (await store.listEvents()).map((e) => e.kind);
    assert.deepEqual(kinds, ["remember"], "browsing produces no events");
  });
});

describe("conflict.detected events (detection reported, resolution unchanged)", () => {
  it("a near-duplicate write emits conflict.detected and still merges as before", async () => {
    const store = memStore({ scope: "/proj/a" });
    const first = await store.remember({ content: "deploy from the main branch" });
    const second = await store.remember({ content: "Deploy from the main branch!" });

    assert.equal(second.id, first.id, "resolution unchanged: still deduped into one row");
    assert.equal((await store.list()).length, 1);

    const findings = (await store.listEvents()).filter((e) => e.kind === "conflict.detected");
    assert.equal(findings.length, 1);
    const e = findings[0]!;
    assert.equal(e.detail?.reason, "near-duplicate");
    assert.equal(e.detail?.existingId, first.id);
    assert.equal(e.detail?.incomingPreview, "Deploy from the main branch!");
    assert.equal(e.memoryId, first.id, "the event anchors to the row it merged into");
    assert.equal(e.scope, "/proj/a");
  });

  it("an NLI-flagged contradiction emits conflict.detected; both rows persist, links intact", async () => {
    // Embedding-close (cos 0.97) but not the same statement → passes the topical
    // gate; the stub scorer then calls it a contradiction. Mirrors conflict.test.ts.
    const a = "rate limit is 600 per minute";
    const b = "rate limit is 1000 per minute";
    const vectors: Record<string, Float32Array> = {
      [a]: Float32Array.from([1, 0]),
      [b]: Float32Array.from([0.97, 0.2431]),
    };
    const embedder: Embedder = {
      dimensions: 2,
      embed: async (text) => {
        const v = vectors[text];
        if (!v) throw new Error(`no stub vector for ${JSON.stringify(text)}`);
        return v;
      },
    };
    const scorer: ContradictionScorer = { contradiction: async () => 0.95 };
    const store = new SqliteStorage({
      path: ":memory:",
      embedder,
      scope: "/proj/a",
      detectConflicts: true,
      contradictionScorer: scorer,
    });

    const mA = await store.remember({ content: a, project: "norn" });
    const mB = await store.remember({ content: b, project: "norn" });

    // Resolution behavior unchanged: two rows, symmetric possible_conflict_with.
    const all = await store.list();
    assert.equal(all.length, 2, "a contradiction is flagged, never merged");
    const metaA = parseMetadata(all.find((m) => m.id === mA.id)!.metadata);
    assert.deepEqual(metaA.possible_conflict_with, [mB.id], "flagging still happens");

    const findings = (await store.listEvents()).filter((e) => e.kind === "conflict.detected");
    assert.equal(findings.length, 1);
    const e = findings[0]!;
    assert.equal(e.detail?.reason, "contradiction");
    assert.equal(e.detail?.existingId, mA.id, "names the existing memory it contradicts");
    assert.equal(e.detail?.incomingPreview, b);
    assert.equal(e.project, "norn");
  });

  it("a clean write emits no conflict.detected", async () => {
    const store = memStore();
    await store.remember({ content: "the api gateway lives in us-east-1" });
    await store.remember({ content: "standup is at 9:30 on tuesdays" });
    const kinds = (await store.listEvents()).map((e) => e.kind);
    assert.ok(!kinds.includes("conflict.detected"), "no findings without a conflict");
  });
});

describe("agent identity stamping", () => {
  it("events use the constructor seed until setAgentId upgrades it; past events keep theirs", async () => {
    const store = memStore({ agentId: "agent-seed" });
    await store.remember({ content: "written before initialize" });
    store.setAgentId("claude-code");
    await store.remember({ content: "written after initialize" });

    const events = await store.listEvents();
    assert.equal(events.length, 2);
    assert.equal(events[0]!.agentId, "agent-seed", "earlier events are history, not rewritten");
    assert.equal(events[1]!.agentId, "claude-code");
  });

  it("with no agent id at all, events record null rather than failing", async () => {
    const store = memStore();
    await store.remember({ content: "anonymous write" });
    assert.equal((await store.listEvents())[0]!.agentId, null);
  });
});

describe("listEvents cursor and scope filtering", () => {
  it("afterId resumes exactly where the reader left off", async () => {
    const store = memStore();
    await store.remember({ content: "one" });
    await store.remember({ content: "two" });
    const first = await store.listEvents();
    assert.equal(first.length, 2);
    assert.ok(first[1]!.id > first[0]!.id, "ids are monotonic");

    await store.remember({ content: "three" });
    const tail = await store.listEvents({ afterId: first[1]!.id });
    assert.equal(tail.length, 1, "only the event after the cursor");
    assert.equal(tail[0]!.detail?.preview, "three");

    assert.equal((await store.listEvents({ afterId: tail[0]!.id })).length, 0, "caught up");
  });

  it("scope filter shows own + global activity and never another project's", async () => {
    const store = memStore();
    await store.remember({ content: "a-note", scope: "/proj/a" });
    await store.remember({ content: "b-note", scope: "/proj/b" });
    await store.remember({ content: "global-note", scope: null });

    const feedA = await store.listEvents({ scope: "/proj/a" });
    assert.deepEqual(
      feedA.map((e) => e.detail?.preview),
      ["a-note", "global-note"],
      "own scope plus global, never /proj/b",
    );

    const all = await store.listEvents();
    assert.equal(all.length, 3, "no filter: the whole log (dashboard view)");
  });

  it("limit fills with in-scope events even when out-of-scope rows are interleaved", async () => {
    const store = memStore();
    // Interleave so a naive LIMIT-then-filter would come up short.
    await store.remember({ content: "a-1", scope: "/proj/a" });
    await store.remember({ content: "b-1", scope: "/proj/b" });
    await store.remember({ content: "a-2", scope: "/proj/a" });
    await store.remember({ content: "b-2", scope: "/proj/b" });
    await store.remember({ content: "a-3", scope: "/proj/a" });

    const page = await store.listEvents({ scope: "/proj/a", limit: 3 });
    assert.deepEqual(
      page.map((e) => e.detail?.preview),
      ["a-1", "a-2", "a-3"],
      "the page holds exactly `limit` visible events, skipping the other scope",
    );
  });
});

describe("event logging never breaks the memory write", () => {
  it("a broken events table is logged to stderr and the remember still commits", async () => {
    // Build a db whose `events` table exists but with the wrong shape, so
    // CREATE TABLE IF NOT EXISTS no-ops in migrate() and every event INSERT fails.
    const dbPath = path.join(tmp, "sabotaged.db");
    const embedder = new HashEmbedder();
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
        scope      TEXT,
        metadata   TEXT
      );
      -- Wrong shape, but with \`scope\` so migrate()'s index still applies: the
      -- sabotage targets the event INSERT, which is the guarded path under test.
      CREATE TABLE events (id INTEGER PRIMARY KEY, scope TEXT, bogus TEXT NOT NULL);
    `);
    raw.exec(
      `CREATE VIRTUAL TABLE memories_vec USING vec0(
        memory_id TEXT PRIMARY KEY,
        embedding FLOAT[${embedder.dimensions}]
      );`,
    );
    raw.close();

    const errors: string[] = [];
    const realError = console.error;
    console.error = (...args: unknown[]) => {
      errors.push(args.map(String).join(" "));
    };
    const store = new SqliteStorage({ path: dbPath, embedder, scope: "/p" });
    try {
      const m = await store.remember({ content: "must survive the broken log" });
      const all = await store.list();
      assert.equal(all.length, 1, "the memory write committed despite the event failure");
      assert.equal(all[0]!.id, m.id);

      assert.equal(await store.forget(m.id), true, "forget also survives");
      assert.equal((await store.list()).length, 0);

      assert.ok(
        errors.some((line) => line.includes("failed to log")),
        "the swallowed failure was reported on stderr",
      );
    } finally {
      console.error = realError;
      await store.close();
    }
  });
});

describe("safe migration from a pre-events database", () => {
  it("adds the events table on open; existing memories are untouched; reopen is idempotent", async () => {
    // A database from the version just before events: memories (with scope +
    // metadata) and the vec index, but no events table.
    const dbPath = path.join(tmp, "pre-events.db");
    const embedder = new HashEmbedder();
    const iso = "2026-06-01T00:00:00.000Z";
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
        scope      TEXT,
        metadata   TEXT
      );
    `);
    raw.exec(
      `CREATE VIRTUAL TABLE memories_vec USING vec0(
        memory_id TEXT PRIMARY KEY,
        embedding FLOAT[${embedder.dimensions}]
      );`,
    );
    const emb = await embedder.embed("a memory from before the activity log");
    raw
      .prepare(
        `INSERT INTO memories (id, content, tags, project, created_at, updated_at, scope, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run("pre-1", "a memory from before the activity log", "[]", null, iso, iso, "/p", null);
    raw
      .prepare(`INSERT INTO memories_vec (memory_id, embedding) VALUES (?, ?)`)
      .run("pre-1", new Uint8Array(emb.buffer));
    raw.close();

    const s1 = new SqliteStorage({ path: dbPath, embedder, scope: "/p" });
    try {
      assert.equal((await s1.list()).length, 1, "old rows survive the upgrade");
      assert.deepEqual(await s1.listEvents(), [], "the log starts empty — no invented history");
      await s1.remember({ content: "first post-upgrade write" });
      assert.equal((await s1.listEvents()).length, 1, "the upgraded db records events");
    } finally {
      await s1.close();
    }

    // Reopening runs migrate() again; it must not throw, duplicate, or drop events.
    const s2 = new SqliteStorage({ path: dbPath, embedder, scope: "/p" });
    try {
      assert.equal((await s2.list()).length, 2);
      assert.equal((await s2.listEvents()).length, 1, "the logged event persisted across reopen");
    } finally {
      await s2.close();
    }
  });
});
