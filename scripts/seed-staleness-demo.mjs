// Throwaway seeder to eyeball the staleness UI by hand.
//
//   node scripts/seed-staleness-demo.mjs
//   NORN_DB_PATH="$PWD/.norn-staleness-demo/norn.db" npm run dev -w @samad001z/norn-web
//   # open http://localhost:3000/app
//
// Writes to a dedicated db (NOT your real store). Delete the folder when done.
import { SqliteStorage, MiniLMEmbedder, stalenessScore } from "@samad001z/norn-core";
import { rmSync } from "node:fs";
import path from "node:path";

const dir = path.join(process.cwd(), ".norn-staleness-demo");
rmSync(dir, { recursive: true, force: true });
const dbPath = path.join(dir, "norn.db");

const DAY = 1000 * 60 * 60 * 24;
const clock = { ms: Date.now() };
const store = new SqliteStorage({
  path: dbPath,
  embedder: new MiniLMEmbedder(),
  now: () => new Date(clock.ms),
});

const at = (daysAgo) => {
  clock.ms = Date.now() - daysAgo * DAY;
};

// 1. fresh — written today.
at(0);
await store.remember({ content: "Fresh: written today.", tags: ["demo"], project: "demo" });

// 2. aging — last touched 45 days ago, never recalled (30–90d bucket).
at(45);
await store.remember({ content: "Aging: last edited 45 days ago, never recalled.", tags: ["demo"], project: "demo" });

// 3. stale — last touched 120 days ago, never recalled (>= 90d, the strong signal).
at(120);
const stale = await store.remember({ content: "Stale: 120 days old and never recalled.", tags: ["demo"], project: "demo" });

// 4. keeper — old (120d) but recalled 5+ times recently → should read FRESH.
at(120);
const keeper = await store.remember({ content: "Old but frequently recalled — a keeper.", tags: ["demo"], project: "demo" });
at(2); // recall it five times, "2 days ago". limit:1 so ONLY the keeper (its own
       // exact text is the top match) gets stamped — recall stamps everything it returns.
for (let i = 0; i < 5; i++) await store.recall("Old but frequently recalled — a keeper.", { limit: 1 });

// Print the computed level for each so the script self-verifies before you even look.
clock.ms = Date.now();
const now = new Date();
for (const m of await store.list()) {
  console.log(`${stalenessScore(m, now).padEnd(6)}  ${m.content}`);
}
await store.close();
console.log(`\nSeeded ${dbPath}\nLaunch:  NORN_DB_PATH="${dbPath}" npm run dev -w @samad001z/norn-web`);
void stale; void keeper;
