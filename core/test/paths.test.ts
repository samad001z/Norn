import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  HashEmbedder,
  SqliteStorage,
  cwdProjectRoot,
  defaultDbPath,
  findProjectDbPath,
  initProjectStore,
  resolveDbPath,
  resolveStore,
} from "../src/index.js";

/** A throwaway temp directory tree, cleaned up after each test. */
let tmp: string;
const savedEnv = process.env.NORN_DB_PATH;

beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), "norn-paths-"));
  delete process.env.NORN_DB_PATH;
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
  if (savedEnv === undefined) delete process.env.NORN_DB_PATH;
  else process.env.NORN_DB_PATH = savedEnv;
});

describe("findProjectDbPath", () => {
  it("finds a .norn directory in the cwd itself", () => {
    mkdirSync(path.join(tmp, ".norn"));
    assert.equal(findProjectDbPath(tmp), path.join(tmp, ".norn", "norn.db"));
  });

  it("walks up to the nearest ancestor with a .norn", () => {
    mkdirSync(path.join(tmp, ".norn"));
    const nested = path.join(tmp, "packages", "web", "src");
    mkdirSync(nested, { recursive: true });
    assert.equal(findProjectDbPath(nested), path.join(tmp, ".norn", "norn.db"));
  });

  it("prefers the nearest .norn when several ancestors have one", () => {
    mkdirSync(path.join(tmp, ".norn"));
    const inner = path.join(tmp, "packages", "web");
    mkdirSync(path.join(inner, ".norn"), { recursive: true });
    assert.equal(findProjectDbPath(inner), path.join(inner, ".norn", "norn.db"));
  });

  it("returns null when no ancestor has a .norn", () => {
    const nested = path.join(tmp, "a", "b");
    mkdirSync(nested, { recursive: true });
    assert.equal(findProjectDbPath(nested), null);
  });
});

describe("resolveDbPath precedence", () => {
  it("uses NORN_DB_PATH even when a project .norn exists", () => {
    mkdirSync(path.join(tmp, ".norn"));
    process.env.NORN_DB_PATH = path.join(tmp, "override.db");
    assert.equal(resolveDbPath(tmp), path.join(tmp, "override.db"));
  });

  it("uses the project store when no env override is set", () => {
    mkdirSync(path.join(tmp, ".norn"));
    assert.equal(resolveDbPath(tmp), path.join(tmp, ".norn", "norn.db"));
  });

  it("falls back to the global store when nothing project-local is found", () => {
    const nested = path.join(tmp, "no", "norn", "here");
    mkdirSync(nested, { recursive: true });
    assert.equal(resolveDbPath(nested), defaultDbPath());
  });
});

describe("initProjectStore", () => {
  it("creates .norn with a .gitignore that ignores the binary db, not memory.json", () => {
    const result = initProjectStore(tmp);
    assert.equal(result.created, true);
    assert.equal(result.dbPath, path.join(tmp, ".norn", "norn.db"));

    const gitignore = readFileSync(path.join(tmp, ".norn", ".gitignore"), "utf8");
    // The binary db and its sidecars are ignored; the diffable export is not, so
    // memory.json is the committed artifact (the documented export/import flow).
    assert.ok(/^norn\.db$/m.test(gitignore), "the binary db is ignored");
    assert.ok(gitignore.includes("norn.db-wal"));
    assert.ok(gitignore.includes("norn.db-shm"));
    assert.ok(gitignore.includes("norn.db-journal"));
    assert.ok(!/^memory\.json$/m.test(gitignore), "memory.json is committed, not ignored");
  });

  it("is idempotent and reports created:false the second time", () => {
    initProjectStore(tmp);
    const second = initProjectStore(tmp);
    assert.equal(second.created, false);
    assert.ok(existsSync(path.join(tmp, ".norn", ".gitignore")));
  });
});

describe("resolveStore", () => {
  it("override: NORN_DB_PATH is pooled (no scope, no isolation)", () => {
    process.env.NORN_DB_PATH = path.join(tmp, "shared.db");
    const r = resolveStore(tmp);
    assert.equal(r.dbPath, path.join(tmp, "shared.db"));
    assert.equal(r.scope, null);
    assert.equal(r.isolate, false);
  });

  it("per-project: scope is the project root, isolate off (file is the boundary)", () => {
    mkdirSync(path.join(tmp, ".norn"));
    const r = resolveStore(tmp);
    assert.equal(r.dbPath, path.join(tmp, ".norn", "norn.db"));
    assert.equal(r.scope, tmp);
    assert.equal(r.isolate, false);
  });

  it("global: falls back to the global db, isolates by cwd project root", () => {
    // A .git dir marks the project root even without `norn init`.
    const root = path.join(tmp, "repo");
    mkdirSync(path.join(root, ".git"), { recursive: true });
    const nested = path.join(root, "src");
    mkdirSync(nested);
    const r = resolveStore(nested);
    assert.equal(r.dbPath, defaultDbPath());
    assert.equal(r.scope, root, "scope is the .git root, not the nested cwd");
    assert.equal(r.isolate, true);
  });
});

describe("cwdProjectRoot", () => {
  it("walks up to a .git root", () => {
    const root = path.join(tmp, "repo");
    mkdirSync(path.join(root, ".git"), { recursive: true });
    const nested = path.join(root, "a", "b");
    mkdirSync(nested, { recursive: true });
    assert.equal(cwdProjectRoot(nested), root);
  });

  it("falls back to cwd itself when no project marker exists", () => {
    const nested = path.join(tmp, "loose", "dir");
    mkdirSync(nested, { recursive: true });
    assert.equal(cwdProjectRoot(nested), nested);
  });
});

describe("two project stores stay isolated", () => {
  it("a memory in one project's db is invisible to another's", async () => {
    const aPath = initProjectStore(path.join(tmp, "projA")).dbPath;
    const bPath = initProjectStore(path.join(tmp, "projB")).dbPath;

    const a = new SqliteStorage({ path: aPath, embedder: new HashEmbedder() });
    const b = new SqliteStorage({ path: bPath, embedder: new HashEmbedder() });
    try {
      await a.remember({ content: "only project A knows this" });

      assert.equal((await a.list()).length, 1);
      assert.equal((await b.list()).length, 0, "B's store never saw A's memory");
      assert.equal((await b.recall("only project A knows this")).length, 0);
    } finally {
      await a.close();
      await b.close();
    }
  });
});
