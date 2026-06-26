import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { HashEmbedder, SqliteStorage, estimateTokens, parseMetadata, type Embedder, type Storage } from "../src/index.js";

/** Deterministic embedder: maps known strings to fixed (then normalized) vectors. */
class StubEmbedder implements Embedder {
  readonly dimensions: number;
  constructor(
    private readonly vectors: Record<string, number[]>,
    dimensions: number,
  ) {
    this.dimensions = dimensions;
  }
  async embed(text: string): Promise<Float32Array> {
    const v = this.vectors[text];
    if (!v) throw new Error(`StubEmbedder has no vector for ${JSON.stringify(text)}`);
    const arr = Float32Array.from(v);
    let norm = 0;
    for (const x of arr) norm += x * x;
    norm = Math.sqrt(norm) || 1;
    for (let i = 0; i < arr.length; i++) arr[i] = (arr[i] ?? 0) / norm;
    return arr;
  }
}

/** A mutable clock so tests control creation/recency times. */
function clockAt(start: string) {
  const c = { current: new Date(start) };
  return { c, now: () => c.current };
}

const DAY = 1000 * 60 * 60 * 24;

describe("remember + list", () => {
  let store: Storage;
  beforeEach(() => {
    store = new SqliteStorage({ path: ":memory:", embedder: new HashEmbedder() });
  });

  it("stores content with tags, project, and timestamps", async () => {
    const m = await store.remember({ content: "  deploy from main  ", tags: ["ops"], project: "web" });
    assert.equal(m.content, "deploy from main"); // trimmed
    assert.deepEqual(m.tags, ["ops"]);
    assert.equal(m.project, "web");
    assert.ok(m.id.length > 0);
    assert.equal(m.createdAt, m.updatedAt);
    assert.doesNotThrow(() => new Date(m.createdAt).toISOString());
  });

  it("defaults tags to [] and project to null", async () => {
    const m = await store.remember({ content: "a flat white" });
    assert.deepEqual(m.tags, []);
    assert.equal(m.project, null);
  });

  it("defaults metadata to null and round-trips it through list and recall", async () => {
    const m = await store.remember({ content: "a fact worth keeping" });
    assert.equal(m.metadata, null, "no soft signals on write");
    assert.equal((await store.list())[0]!.metadata, null, "null survives list");
    assert.equal((await store.recall("a fact worth keeping"))[0]!.metadata, null, "null survives recall");
  });

  it("rejects empty content", async () => {
    await assert.rejects(() => store.remember({ content: "   " }), /empty/);
  });

  it("lists newest first and filters by project (incl. global)", async () => {
    const { c, now } = clockAt("2026-01-01T00:00:00Z");
    store = new SqliteStorage({ path: ":memory:", embedder: new HashEmbedder(), now });

    c.current = new Date("2026-01-01T00:00:00Z");
    await store.remember({ content: "first global thought" });
    c.current = new Date("2026-01-02T00:00:00Z");
    await store.remember({ content: "alpha project note", project: "alpha" });
    c.current = new Date("2026-01-03T00:00:00Z");
    await store.remember({ content: "bravo project note", project: "bravo" });

    const all = await store.list();
    assert.equal(all.length, 3);
    assert.equal(all[0]!.content, "bravo project note"); // newest first

    assert.deepEqual((await store.list({ project: "alpha" })).map((m) => m.content), [
      "alpha project note",
    ]);
    assert.deepEqual((await store.list({ project: null })).map((m) => m.content), [
      "first global thought",
    ]);
  });
});

describe("dedupe of near-identical content", () => {
  it("merges tags and bumps updatedAt instead of duplicating", async () => {
    const { c, now } = clockAt("2026-01-01T00:00:00Z");
    const store = new SqliteStorage({ path: ":memory:", embedder: new HashEmbedder(), now });

    c.current = new Date("2026-01-01T00:00:00Z");
    const a = await store.remember({ content: "rotate API keys monthly", tags: ["security"], project: "x" });
    c.current = new Date("2026-01-05T00:00:00Z");
    const b = await store.remember({ content: "rotate API keys monthly", tags: ["ops"], project: "x" });

    assert.equal(b.id, a.id, "same memory returned");
    assert.deepEqual([...b.tags].sort(), ["ops", "security"]);
    assert.equal(b.createdAt, a.createdAt, "createdAt preserved");
    assert.ok(new Date(b.updatedAt) > new Date(a.updatedAt), "updatedAt bumped");
    assert.equal((await store.list()).length, 1, "no duplicate row");
  });

  it("does not merge identical content across different projects", async () => {
    const store = new SqliteStorage({ path: ":memory:", embedder: new HashEmbedder() });
    await store.remember({ content: "shared note", project: "a" });
    await store.remember({ content: "shared note", project: "b" });
    assert.equal((await store.list()).length, 2);
  });
});

describe("forget", () => {
  it("removes a memory and stops recalling it", async () => {
    const store = new SqliteStorage({ path: ":memory:", embedder: new HashEmbedder() });
    const m = await store.remember({ content: "temporary fact" });

    assert.equal(await store.forget(m.id), true);
    assert.equal(await store.forget(m.id), false, "second forget is a no-op");
    assert.equal((await store.list()).length, 0);
    assert.equal((await store.recall("temporary fact")).length, 0);
  });
});

describe("recall: semantic + recency within a token budget", () => {
  it("ranks the most relevant memory first", async () => {
    const store = new SqliteStorage({
      path: ":memory:",
      embedder: new StubEmbedder(
        { "find me": [1, 0, 0, 0], "the answer": [1, 0, 0, 0], unrelated: [0, 1, 0, 0] },
        4,
      ),
    });
    await store.remember({ content: "the answer" });
    await store.remember({ content: "unrelated" });

    const results = await store.recall("find me");
    assert.equal(results[0]!.content, "the answer");
    assert.ok(results[0]!.score > results[1]!.score);
  });

  it("breaks ties toward the more recent memory", async () => {
    const { c, now } = clockAt("2026-03-01T00:00:00Z");
    // A and B are equally relevant to the query (cosine 0.8) but distinct (0.64).
    const store = new SqliteStorage({
      path: ":memory:",
      now,
      embedder: new StubEmbedder(
        { q: [1, 0, 0, 0], A: [0.8, 0.6, 0, 0], B: [0.8, 0, 0.6, 0] },
        4,
      ),
    });

    c.current = new Date(Date.parse("2026-03-01T00:00:00Z") - 60 * DAY); // A is old
    const a = await store.remember({ content: "A" });
    c.current = new Date("2026-03-01T00:00:00Z"); // B is fresh
    const b = await store.remember({ content: "B" });

    const results = await store.recall("q");
    assert.deepEqual(results.map((r) => r.id), [b.id, a.id], "recent first on equal relevance");
  });

  it("stops adding results once the token budget is spent", async () => {
    const store = new SqliteStorage({ path: ":memory:", embedder: new HashEmbedder() });
    const pad40 = (word: string) => {
      let s = "";
      while (s.length < 40) s += word + " ";
      return s.slice(0, 40);
    };
    for (const word of ["alpha", "bravo", "charlie", "delta"]) {
      await store.remember({ content: pad40(word) });
    }
    assert.equal((await store.list()).length, 4, "all four stored, none deduped");

    // Each is ~10 tokens; a 25-token budget fits exactly two.
    const results = await store.recall("alpha", { tokenBudget: 25 });
    assert.equal(results.length, 2);
    const used = results.reduce((n, r) => n + estimateTokens(r.content), 0);
    assert.ok(used <= 25);
  });

  it("always returns at least the top match, even past budget", async () => {
    const store = new SqliteStorage({ path: ":memory:", embedder: new HashEmbedder() });
    await store.remember({ content: "a single sizable memory worth keeping" });
    const results = await store.recall("memory", { tokenBudget: 1 });
    assert.equal(results.length, 1);
  });

  it("honors the limit", async () => {
    const store = new SqliteStorage({ path: ":memory:", embedder: new HashEmbedder() });
    await store.remember({ content: "one" });
    await store.remember({ content: "two" });
    await store.remember({ content: "three" });
    assert.equal((await store.recall("number", { limit: 1 })).length, 1);
  });
});

describe("recall stamps access signals into metadata", () => {
  const stub = () =>
    new StubEmbedder({ "find me": [1, 0, 0, 0], "the answer": [1, 0, 0, 0] }, 4);

  it("sets last_recalled_at and increments recall_count on each recall", async () => {
    const { c, now } = clockAt("2026-04-01T00:00:00Z");
    const store = new SqliteStorage({ path: ":memory:", embedder: stub(), now });
    const m = await store.remember({ content: "the answer" });
    assert.equal(m.metadata, null, "no signals before any recall");

    c.current = new Date("2026-04-02T00:00:00Z");
    const r1 = await store.recall("find me");
    assert.equal(r1[0]!.id, m.id, "the memory is surfaced");

    const after1 = parseMetadata((await store.list())[0]!.metadata);
    assert.equal(after1.recall_count, 1, "count starts at 1");
    assert.equal(after1.last_recalled_at, "2026-04-02T00:00:00.000Z", "stamped at recall time");

    c.current = new Date("2026-04-03T00:00:00Z");
    await store.recall("find me");
    const after2 = parseMetadata((await store.list())[0]!.metadata);
    assert.equal(after2.recall_count, 2, "count increments on the second recall");
    assert.equal(after2.last_recalled_at, "2026-04-03T00:00:00.000Z", "timestamp refreshed");
  });

  it("does not touch updated_at — a recall is an access, not an edit", async () => {
    const { c, now } = clockAt("2026-04-01T00:00:00Z");
    const store = new SqliteStorage({ path: ":memory:", embedder: stub(), now });
    const m = await store.remember({ content: "the answer" });

    c.current = new Date("2026-05-01T00:00:00Z"); // a month later
    await store.recall("find me");

    const after = (await store.list())[0]!;
    assert.equal(after.updatedAt, m.updatedAt, "updated_at unchanged by recall");
    assert.equal(parseMetadata(after.metadata).recall_count, 1, "but the access was recorded");
  });

  it("a NULL-metadata memory recalls exactly as today (shape and values unchanged)", async () => {
    const store = new SqliteStorage({ path: ":memory:", embedder: stub() });
    await store.remember({ content: "the answer" });
    const r = await store.recall("find me");
    assert.equal(r.length, 1);
    assert.equal(r[0]!.metadata, null, "query-time snapshot: pre-stamp value returned");
    assert.equal(typeof r[0]!.score, "number", "score still present");
  });
});
