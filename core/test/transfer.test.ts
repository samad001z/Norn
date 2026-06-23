import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  HashEmbedder,
  SqliteStorage,
  exportMemories,
  importMemories,
  memoryExportPath,
  parseExport,
  serializeExport,
  MEMORY_EXPORT_VERSION,
} from "../src/index.js";

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), "norn-transfer-"));
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

/** A clock that advances one minute per write, for deterministic timestamps. */
function steppingClock(startMs = Date.parse("2026-01-01T00:00:00.000Z")) {
  let ms = startMs;
  return () => {
    const d = new Date(ms);
    ms += 60_000;
    return d;
  };
}

/** Seed a store with a fixed, varied set of memories. */
async function seed(store: SqliteStorage) {
  await store.remember({
    content: "Deploy to prod from the main branch; every PR gets a preview.",
    tags: ["deploy", "ops"],
    project: "harbor-web",
  });
  await store.remember({
    content: "The team prefers tabs over spaces and a 100 character line width.",
    tags: ["style"],
    project: "harbor-web",
  });
  await store.remember({
    content: "Keep commits small and put the why in the body.",
    tags: [],
    project: null,
  });
}

describe("export/import round-trip", () => {
  it("rebuilds memories and working recall after wiping the db", async () => {
    const dbPath = path.join(tmp, ".norn", "norn.db");
    const embedder = new HashEmbedder();

    // 1. Store memories in a file-backed store.
    const original = new SqliteStorage({
      path: dbPath,
      embedder,
      scope: tmp,
      now: steppingClock(),
    });
    await seed(original);
    const before = await original.list();
    assert.equal(before.length, 3, "three memories stored");
    const exp = await exportMemories(original);
    await original.close();

    // 2. Wipe the db entirely — file and WAL sidecars.
    for (const f of ["norn.db", "norn.db-wal", "norn.db-shm"]) {
      rmSync(path.join(tmp, ".norn", f), { force: true });
    }
    assert.ok(!existsSync(dbPath), "db file is gone");

    // 3. Reopen a fresh, empty store on the same path and import.
    const restored = new SqliteStorage({ path: dbPath, embedder, scope: tmp });
    try {
      assert.equal((await restored.list()).length, 0, "fresh store starts empty");

      const { imported } = await importMemories(restored, exp);
      assert.equal(imported, 3, "all three imported");

      // Memories come back, identical in their durable fields.
      const after = await restored.list();
      assert.deepEqual(
        after.map((m) => ({
          id: m.id,
          content: m.content,
          tags: m.tags,
          project: m.project,
          createdAt: m.createdAt,
          updatedAt: m.updatedAt,
        })),
        before.map((m) => ({
          id: m.id,
          content: m.content,
          tags: m.tags,
          project: m.project,
          createdAt: m.createdAt,
          updatedAt: m.updatedAt,
        })),
        "ids, content, tags, project, and timestamps survive the round-trip",
      );

      // Recall works again — embeddings were regenerated locally from text, not
      // carried in the file. (Run against an unrelated query so a match proves
      // the vector index was rebuilt, not that the row text happens to match.)
      const hits = await restored.recall("deploy to production");
      assert.ok(hits.length > 0, "recall returns results after import");
      assert.ok(
        hits.some((h) => h.content.includes("Deploy to prod")),
        "the deploy memory is recalled by meaning, proving its embedding was rebuilt",
      );
    } finally {
      await restored.close();
    }
  });

  it("does not write embedding vectors into the export file", async () => {
    const store = new SqliteStorage({ path: ":memory:", embedder: new HashEmbedder() });
    try {
      await seed(store);
      const text = serializeExport(await exportMemories(store));
      assert.ok(!/embedding|vector|Float32|\bvec\b/i.test(text), "no vector data in the file");
      const doc = JSON.parse(text);
      assert.equal(doc.version, MEMORY_EXPORT_VERSION);
      for (const m of doc.memories) {
        assert.deepEqual(
          Object.keys(m).sort(),
          ["content", "createdAt", "id", "project", "tags", "updatedAt"],
          "only the durable, portable fields are serialized (no scope, no embedding)",
        );
      }
    } finally {
      await store.close();
    }
  });

  it("serializes deterministically: re-exporting an unchanged store is byte-identical", async () => {
    const store = new SqliteStorage({
      path: path.join(tmp, "det.db"),
      embedder: new HashEmbedder(),
      now: steppingClock(),
    });
    try {
      await seed(store);
      const first = serializeExport(await exportMemories(store));
      const second = serializeExport(await exportMemories(store));
      assert.equal(first, second, "two exports of the same store match exactly");
      assert.ok(first.endsWith("\n"), "file ends with a trailing newline");
    } finally {
      await store.close();
    }
  });

  it("re-importing the same file is idempotent (upsert, no duplicates)", async () => {
    const store = new SqliteStorage({ path: ":memory:", embedder: new HashEmbedder(), scope: "/p" });
    try {
      await seed(store);
      const exp = await exportMemories(store);
      await importMemories(store, exp);
      await importMemories(store, exp);
      assert.equal((await store.list()).length, 3, "re-import did not duplicate rows");
    } finally {
      await store.close();
    }
  });

  it("import re-stamps scope from the importing store, not the file", async () => {
    // Export from a store scoped to /proj/a...
    const a = new SqliteStorage({ path: ":memory:", embedder: new HashEmbedder(), scope: "/proj/a" });
    await a.remember({ content: "scoped fact" });
    const exp = await exportMemories(a);
    await a.close();
    assert.ok(!JSON.stringify(exp).includes("/proj/a"), "scope path is absent from the export");

    // ...import into a store scoped to /proj/b: the row takes B's scope.
    const b = new SqliteStorage({ path: ":memory:", embedder: new HashEmbedder(), scope: "/proj/b" });
    try {
      await importMemories(b, exp);
      const [m] = await b.list();
      assert.equal(m!.scope, "/proj/b", "scope is re-stamped on import for portability");
    } finally {
      await b.close();
    }
  });

  it("parseExport rejects malformed or unsupported files", () => {
    assert.throws(() => parseExport("not json"), /not valid JSON/);
    assert.throws(() => parseExport(JSON.stringify({ version: 999, memories: [] })), /Unsupported/);
    assert.throws(() => parseExport(JSON.stringify({ version: MEMORY_EXPORT_VERSION })), /memories/);
    assert.throws(
      () => parseExport(JSON.stringify({ version: MEMORY_EXPORT_VERSION, memories: [{ id: 1 }] })),
      /must be a string/,
    );
  });

  it("memoryExportPath places memory.json beside the db", () => {
    assert.equal(
      memoryExportPath(path.join(tmp, ".norn", "norn.db")),
      path.join(tmp, ".norn", "memory.json"),
    );
  });
});
