// EXPERIMENTAL prototype (Phase 2, option c) — NOT wired into the product.
//
// Question: can a small NLI / entailment model do what embedding similarity can't —
// tell a contradiction ("deploy on Vercel" vs "deploy on Railway") apart from a
// refinement or unrelated text? Embeddings score the Vercel/Railway pair ~0.44,
// indistinguishable from noise. NLI judges a (premise, hypothesis) PAIR as
// entailment / neutral / contradiction directly, which is the signal we actually want.
//
//   node scripts/prototype-nli.mjs
//
// Downloads a ~70MB model on first run (cached after). Reports a symmetric
// contradiction score = max(contradiction(A,B), contradiction(B,A)).
import { AutoTokenizer, AutoModelForSequenceClassification, env } from "@xenova/transformers";

env.allowLocalModels = false; // always resolve from the hub cache

const MODEL = "Xenova/nli-deberta-v3-xsmall";
const tokenizer = await AutoTokenizer.from_pretrained(MODEL);
const model = await AutoModelForSequenceClassification.from_pretrained(MODEL, { quantized: true });

// Map the model's label order (don't assume MNLI's) to our three classes.
const id2label = model.config.id2label;
const idxOf = (needle) =>
  Object.entries(id2label).find(([, l]) => l.toLowerCase().includes(needle))?.[0];
const C = +idxOf("contradict");
const E = +idxOf("entail");

const softmax = (xs) => {
  const m = Math.max(...xs);
  const ex = xs.map((x) => Math.exp(x - m));
  const s = ex.reduce((a, b) => a + b, 0);
  return ex.map((x) => x / s);
};

async function nli(premise, hypothesis) {
  const inputs = await tokenizer(premise, { text_pair: hypothesis });
  const { logits } = await model(inputs);
  const probs = softmax(Array.from(logits.data));
  return { contradiction: probs[C], entailment: probs[E] };
}

// Symmetric: a contradiction holds in either reading.
const contradictionScore = async (a, b) =>
  Math.max((await nli(a, b)).contradiction, (await nli(b, a)).contradiction);

const CASES = [
  ["CONTRADICTION", "We deploy on Vercel", "We deploy on Railway"],
  ["CONTRADICTION", "Use Postgres for the database", "Use MySQL for the database"],
  ["CONTRADICTION", "The rate limit is 600 requests per minute", "The rate limit is 1000 requests per minute"],
  ["CONTRADICTION", "The team prefers tabs over spaces", "The team prefers spaces over tabs"],
  ["CONTRADICTION", "Rotate signing keys every 90 days", "Rotate signing keys every 30 days"],
  ["REFINEMENT  ", "We deploy on Vercel", "We deploy on Vercel from the main branch"],
  ["UNRELATED   ", "We deploy on Vercel", "The team prefers tabs over spaces"],
  ["UNRELATED   ", "Rotate signing keys every 90 days", "The cafe makes a good flat white"],
];

console.log(`model: ${MODEL}\nlabels: ${JSON.stringify(id2label)}\n`);
console.log("expected        contradiction  verdict   pair");
for (const [expected, a, b] of CASES) {
  const score = await contradictionScore(a, b);
  const flag = score >= 0.5 ? "CONFLICT" : "ok      ";
  console.log(`${expected}   ${score.toFixed(3).padStart(9)}    ${flag}  ${a}  ||  ${b}`);
}
