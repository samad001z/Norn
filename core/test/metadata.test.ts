import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseMetadata, serializeMetadata, stampRecall } from "../src/index.js";

describe("metadata helper", () => {
  it("parses null, undefined, and junk to an empty bag", () => {
    assert.deepEqual(parseMetadata(null), {});
    assert.deepEqual(parseMetadata(undefined), {});
    assert.deepEqual(parseMetadata("not json"), {});
    assert.deepEqual(parseMetadata("123"), {}, "non-object JSON degrades to {}");
  });

  it("parses stored text and passes through an already-parsed object", () => {
    assert.deepEqual(parseMetadata('{"recall_count":2}'), { recall_count: 2 });
    assert.deepEqual(parseMetadata({ recall_count: 5 }), { recall_count: 5 });
  });

  it("serializes an empty bag to null and a populated bag to JSON", () => {
    assert.equal(serializeMetadata({}), null, "empty => NULL on disk");
    assert.equal(serializeMetadata({ recall_count: 1 }), '{"recall_count":1}');
  });

  it("stampRecall sets last_recalled_at and increments count without mutating input", () => {
    const before = {};
    const once = stampRecall(before, "2026-04-01T00:00:00.000Z");
    assert.equal(once.recall_count, 1);
    assert.equal(once.last_recalled_at, "2026-04-01T00:00:00.000Z");
    assert.deepEqual(before, {}, "input bag is not mutated");

    const twice = stampRecall(once, "2026-04-02T00:00:00.000Z");
    assert.equal(twice.recall_count, 2, "count increments from the prior value");
    assert.equal(twice.last_recalled_at, "2026-04-02T00:00:00.000Z");
  });

  it("preserves unknown keys when stamping (forward compatible)", () => {
    const stamped = stampRecall({ confidence: 0.9 } as Record<string, unknown>, "t");
    assert.equal((stamped as Record<string, unknown>).confidence, 0.9);
    assert.equal(stamped.recall_count, 1);
  });
});
