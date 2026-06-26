import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  RECENCY_HALF_LIFE_MS,
  STALE_AFTER_MS,
  KEEP_FRESH_RECALL_COUNT,
  combinedScore,
  estimateTokens,
  recencyScore,
  similarityFromDistance,
  staleness,
  stalenessScore,
} from "../src/index.js";

const DAY = 1000 * 60 * 60 * 24;

describe("ranking helpers", () => {
  it("estimateTokens grows with length and is zero for empty", () => {
    assert.equal(estimateTokens(""), 0);
    assert.equal(estimateTokens("abcd"), 1);
    assert.ok(estimateTokens("a".repeat(100)) > estimateTokens("a".repeat(10)));
  });

  it("recencyScore is 1 now and halves at the half-life", () => {
    assert.equal(recencyScore(0), 1);
    assert.equal(recencyScore(-1000), 1, "clock skew clamps to 1");
    assert.ok(Math.abs(recencyScore(RECENCY_HALF_LIFE_MS) - 0.5) < 1e-9);
    assert.ok(recencyScore(2 * RECENCY_HALF_LIFE_MS) < recencyScore(RECENCY_HALF_LIFE_MS));
  });

  it("similarityFromDistance maps identical vectors to 1 and clamps", () => {
    assert.equal(similarityFromDistance(0), 1);
    assert.ok(similarityFromDistance(2) >= 0); // never negative
  });

  it("combinedScore weights meaning more than recency", () => {
    const meaning = combinedScore(1, 0);
    const recent = combinedScore(0, 1);
    assert.ok(meaning > recent);
    assert.ok(Math.abs(combinedScore(1, 1) - 1) < 1e-9);
  });

  it("staleness counts whole idle days and flags past the threshold", () => {
    assert.deepEqual(staleness(0), { idleDays: 0, isStale: false });
    assert.deepEqual(staleness(-DAY), { idleDays: 0, isStale: false }, "clock skew clamps to 0");
    assert.equal(staleness(10 * DAY + 1).idleDays, 10, "floors to whole days");
    assert.equal(staleness(STALE_AFTER_MS - 1).isStale, false, "just under is not stale");
    assert.equal(staleness(STALE_AFTER_MS).isStale, true, "at the threshold is stale");
  });

  it("staleness honors a custom threshold", () => {
    assert.equal(staleness(5 * DAY, 3 * DAY).isStale, true);
    assert.equal(staleness(2 * DAY, 3 * DAY).isStale, false);
  });
});

describe("stalenessScore (read-time freshness level)", () => {
  const NOW = new Date("2026-06-26T00:00:00.000Z");
  /** ISO timestamp `days` before NOW. */
  const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY).toISOString();

  it("a brand-new memory is fresh", () => {
    const m = { updatedAt: daysAgo(0), metadata: null };
    assert.equal(stalenessScore(m, NOW), "fresh");
  });

  it("an old, never-recalled memory is stale", () => {
    // Edited 200 days ago, never recalled (metadata null) → idle from the edit.
    const m = { updatedAt: daysAgo(200), metadata: null };
    assert.equal(stalenessScore(m, NOW), "stale");
  });

  it("an old but recently recalled memory is fresh (recall keeps it alive)", () => {
    // Edited 200 days ago but surfaced by recall 3 days ago → idle from the recall.
    const m = {
      updatedAt: daysAgo(200),
      metadata: { recall_count: 1, last_recalled_at: daysAgo(3) },
    };
    assert.equal(stalenessScore(m, NOW), "fresh");
  });

  it("an old, frequently recalled memory is fresh even if last recall was long ago", () => {
    // Heavily used keeper: 200 days old, last recalled 200 days ago, but count is high.
    const m = {
      updatedAt: daysAgo(200),
      metadata: { recall_count: KEEP_FRESH_RECALL_COUNT, last_recalled_at: daysAgo(200) },
    };
    assert.equal(stalenessScore(m, NOW), "fresh");
  });

  it("buckets idle time: < 30d fresh, 30–90d aging, ≥ 90d stale", () => {
    assert.equal(stalenessScore({ updatedAt: daysAgo(29), metadata: null }, NOW), "fresh");
    assert.equal(stalenessScore({ updatedAt: daysAgo(45), metadata: null }, NOW), "aging");
    assert.equal(stalenessScore({ updatedAt: daysAgo(89), metadata: null }, NOW), "aging");
    assert.equal(stalenessScore({ updatedAt: daysAgo(90), metadata: null }, NOW), "stale");
  });

  it("does not mutate the memory or write anything (pure)", () => {
    const meta = { recall_count: 1, last_recalled_at: daysAgo(3) };
    const m = { updatedAt: daysAgo(200), metadata: meta };
    stalenessScore(m, NOW);
    assert.deepEqual(m.metadata, { recall_count: 1, last_recalled_at: daysAgo(3) });
    assert.equal(m.updatedAt, daysAgo(200));
  });
});
