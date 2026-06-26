// Throwaway seeder to eyeball the "possible conflict" review UI by hand.
//
//   node scripts/seed-conflict-demo.mjs
//   NORN_DB_PATH="$PWD/.norn-conflict-demo/norn.db" npm run dev -w @samad001z/norn-web
//   # open http://localhost:3000/app
//
// Writes a dedicated db (NOT your real store) with detection ON, so a couple of
// contradictory pairs land flagged. The dashboard itself just READS the links —
// it doesn't need detection enabled to show them. Delete the folder when done.
import { SqliteStorage, MiniLMEmbedder, NliContradictionScorer, parseMetadata } from "@samad001z/norn-core";
import { rmSync } from "node:fs";
import path from "node:path";

const dir = path.join(process.cwd(), ".norn-conflict-demo");
rmSync(dir, { recursive: true, force: true });
const dbPath = path.join(dir, "norn.db");

const store = new SqliteStorage({
  path: dbPath,
  embedder: new MiniLMEmbedder(),
  detectConflicts: true,
  contradictionScorer: new NliContradictionScorer(),
});

// Each pair is remembered into its own project so detection stays scoped and clean.
const PAIRS = [
  ["web", "We deploy on Vercel", "We deploy on Railway"], // entity swap → flagged
  ["api", "The rate limit is 600 requests per minute", "The rate limit is 1000 requests per minute"], // value swap → flagged
];
// A non-conflicting refinement and an unrelated memory, to show they are NOT flagged.
const CLEAN = [
  ["web", "Staging auto-deploys from the develop branch"],
  ["notes", "The cafe near the office makes a good flat white"],
];

console.log("Seeding (downloads models on first run)…\n");
for (const [project, a, b] of PAIRS) {
  await store.remember({ content: a, project });
  await store.remember({ content: b, project });
}
for (const [project, content] of CLEAN) await store.remember({ content, project });

for (const m of await store.list()) {
  const links = parseMetadata(m.metadata).possible_conflict_with ?? [];
  console.log(`${links.length ? "FLAGGED" : "ok     "}  [${m.project}]  ${m.content}`);
}
await store.close();
console.log(`\nSeeded ${dbPath}\nLaunch:  NORN_DB_PATH="${dbPath}" npm run dev -w @samad001z/norn-web`);
