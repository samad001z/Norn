import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  RECENCY_HALF_LIFE_MS,
  combinedScore,
  estimateTokens,
  recencyScore,
  similarityFromDistance,
} from "../src/index.js";

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
});
