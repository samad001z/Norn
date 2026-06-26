// Evaluate + tune the two-stage conflict detector against a labelled fixture.
//
//   node scripts/eval-conflict-detection.mjs
//
// Runs the REAL pipeline pieces (MiniLM embeddings + NLI scorer) once per pair,
// caches the numbers, then reports the confusion matrix / precision / recall at
// the shipped thresholds, a per-category breakdown, and a threshold sweep that
// recommends the gate + NLI cut with the best F1. Does NOT change the constants —
// it tells you what to set them to.
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  MiniLMEmbedder,
  NliContradictionScorer,
  sameStatement,
  CONFLICT_TOPICAL_GATE,
  NLI_CONTRADICTION_THRESHOLD,
} from "@samad001z/norn-core";

const { pairs } = JSON.parse(
  readFileSync(path.join(process.cwd(), "scripts/eval/conflict-pairs.json"), "utf8"),
);

const embedder = new MiniLMEmbedder();
const scorer = new NliContradictionScorer();
const cos = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };

// --- Stage the pipeline once per pair, caching sim + nli so the sweep is free. ---
console.log(`Scoring ${pairs.length} pairs with MiniLM + NLI (first run downloads models)…\n`);
const rows = [];
for (const p of pairs) {
  const dup = sameStatement(p.a, p.b); // duplicates are never conflicts
  const sim = cos(await embedder.embed(p.a), await embedder.embed(p.b));
  // Compute NLI for every non-duplicate so the sweep can move the gate freely.
  const nli = dup ? 0 : await scorer.contradiction(p.a, p.b);
  rows.push({ ...p, dup, sim, nli });
}

// Decision under a given (gate, cut): stage 1 then stage 2, mirroring remember().
const decide = (r, gate, cut) => !r.dup && r.sim >= gate && r.nli >= cut;

function score(gate, cut) {
  let tp = 0, fp = 0, fn = 0, tn = 0;
  for (const r of rows) {
    const pred = decide(r, gate, cut);
    if (r.conflict && pred) tp++;
    else if (!r.conflict && pred) fp++;
    else if (r.conflict && !pred) fn++;
    else tn++;
  }
  const precision = tp + fp ? tp / (tp + fp) : 1;
  const recall = tp + fn ? tp / (tp + fn) : 1;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  return { tp, fp, fn, tn, precision, recall, f1 };
}

const pct = (x) => (x * 100).toFixed(0).padStart(3) + "%";

// --- Per-pair table -------------------------------------------------------------
console.log("truth  pred   sim    nli   category        pair");
for (const r of rows) {
  const pred = decide(r, CONFLICT_TOPICAL_GATE, NLI_CONTRADICTION_THRESHOLD);
  const mark = pred === r.conflict ? " " : "✗";
  console.log(
    `${(r.conflict ? "CONF" : "ok  ")}  ${(pred ? "CONF" : "ok  ")} ${mark} ${r.sim.toFixed(2)}  ${r.nli.toFixed(2)}  ${r.category.padEnd(13)}  ${r.a}  ||  ${r.b}`,
  );
}

// --- Headline metrics at the shipped thresholds --------------------------------
const base = score(CONFLICT_TOPICAL_GATE, NLI_CONTRADICTION_THRESHOLD);
console.log(`\nAt shipped thresholds (gate=${CONFLICT_TOPICAL_GATE}, nli=${NLI_CONTRADICTION_THRESHOLD}):`);
console.log(`  TP=${base.tp} FP=${base.fp} FN=${base.fn} TN=${base.tn}`);
console.log(`  precision=${pct(base.precision)}  recall=${pct(base.recall)}  F1=${base.f1.toFixed(3)}`);

// --- Per-category accuracy ------------------------------------------------------
console.log("\nBy category (accuracy at shipped thresholds):");
const cats = [...new Set(rows.map((r) => r.category))];
for (const c of cats) {
  const cr = rows.filter((r) => r.category === c);
  const ok = cr.filter((r) => decide(r, CONFLICT_TOPICAL_GATE, NLI_CONTRADICTION_THRESHOLD) === r.conflict).length;
  console.log(`  ${c.padEnd(14)} ${ok}/${cr.length}`);
}

// --- Threshold sweep ------------------------------------------------------------
let best = null;
for (let gate = 0.2; gate <= 0.6001; gate += 0.05) {
  for (let cut = 0.3; cut <= 0.9001; cut += 0.05) {
    const s = score(gate, cut);
    // Maximise F1, then prefer higher precision (false positives are the costly,
    // trust-eroding failure for a "we flagged this for you" feature).
    if (!best || s.f1 > best.s.f1 + 1e-9 || (Math.abs(s.f1 - best.s.f1) < 1e-9 && s.precision > best.s.precision)) {
      best = { gate: +gate.toFixed(2), cut: +cut.toFixed(2), s };
    }
  }
}
console.log("\nSweep recommendation (max F1, tie→precision):");
console.log(`  gate=${best.gate}  nli=${best.cut}`);
console.log(`  TP=${best.s.tp} FP=${best.s.fp} FN=${best.s.fn} TN=${best.s.tn}`);
console.log(`  precision=${pct(best.s.precision)}  recall=${pct(best.s.recall)}  F1=${best.s.f1.toFixed(3)}`);
console.log("\n(Thresholds are NOT changed automatically — update ranking.ts if you agree.)");
