// Seeds a dedicated demo store with a curated, realistic memory set for the
// README demo GIF. Uses the core's injectable clock so each memory reads with a
// natural age. Target DB is controlled by NORN_DB_PATH.
import { MiniLMEmbedder, SqliteStorage } from "@samad001z/norn-core";

const dbPath = process.env.NORN_DB_PATH;
if (!dbPath) throw new Error("set NORN_DB_PATH to the demo db location");

const SEED = [
  { content: "Deploy to prod from the main branch on Vercel. Every pull request gets a preview deploy.", tags: ["deploy", "ops"], project: "harbor-web", hoursAgo: 4 },
  { content: "recall blends semantic similarity with recency, then trims results to a token budget.", tags: ["recall", "ranking"], project: "norn-core", hoursAgo: 9 },
  { content: "Embeddings sit behind a swappable Embedder interface, so the model is easy to change.", tags: ["architecture", "embeddings"], project: "norn-core", hoursAgo: 26 },
  { content: "Rotate the signing keys every 90 days. The job lives in infra/rotate-keys.", tags: ["security", "ops"], project: "atlas-api", hoursAgo: 50 },
  { content: "Rate limit is 600 requests per minute per token, bursting to 1000.", tags: ["limits"], project: "atlas-api", hoursAgo: 74 },
  { content: "The team prefers tabs over spaces and a 100 character line width.", tags: ["style"], project: "harbor-web", hoursAgo: 120 },
  { content: "Name things by what the user controls, not the implementation. Forget a memory, not delete a vector.", tags: ["writing"], project: null, hoursAgo: 190 },
  { content: "Keep commits small and put the why in the body.", tags: ["workflow"], project: null, hoursAgo: 300 },
];

const clock = { ms: Date.now() };
const store = new SqliteStorage({
  path: dbPath,
  embedder: new MiniLMEmbedder(),
  now: () => new Date(clock.ms),
});

for (const item of SEED) {
  clock.ms = Date.now() - item.hoursAgo * 3600_000;
  await store.remember({ content: item.content, tags: item.tags, project: item.project });
  process.stdout.write(".");
}
clock.ms = Date.now();
await store.close();
console.log(`\nseeded ${SEED.length} memories into ${dbPath}`);
