#!/usr/bin/env tsx
/**
 * Dev-only agent simulator for watching the live dashboard (/app/live).
 *
 * A cast of fake agents — each id tagged with the model it plays — loops
 * randomized remember/recall calls through the REAL core API for ~2 minutes,
 * paced at roughly one event per second. Real rows are written, real events
 * are emitted (never inserted directly), and occasional near-duplicate writes
 * trigger real conflict.detected findings via the dedupe path.
 *
 *   NORN_DB_PATH=<demo db> npm run simulate -w @samad001z/norn-core
 *   npm run simulate -w @samad001z/norn-core -- --seconds 30
 *
 * Point NORN_DB_PATH at the SAME file the dev server uses. As a guard, the
 * simulator refuses to write into the global ~/.norn store unless --force:
 * demo traffic doesn't belong in real memory.
 */
import { randomBytes } from "node:crypto";
import os from "node:os";
import path from "node:path";
import {
  DB_FILENAME,
  MiniLMEmbedder,
  NORN_DIR,
  SqliteStorage,
  resolveStore,
} from "../src/index.js";

// ── the cast: id carries the model tag (that's what colors the sprite) ───────
const AGENTS = [
  "opus-architect",
  "sonnet-reviewer",
  "haiku-scout",
  "gemini-researcher",
  "deepseek-coder",
];

const PROJECTS = ["atlas-api", "harbor-web", "norn"];

// Long, specific statements: distinct enough not to collide by accident, long
// enough that a deliberate near-dupe reliably clears the dedupe threshold.
const SUBJECTS = [
  "the payments service deploys from the release branch every tuesday afternoon",
  "signing keys rotate every 90 days via the infra rotate-keys job",
  "the api rate limit is 600 requests per minute per token with bursts to 1000",
  "postgres connection pooling is handled by pgbouncer in transaction mode",
  "preview environments tear down automatically after 48 hours of inactivity",
  "the design system uses a 4px spacing grid and a 100 character line width",
  "search queries are embedded on-device and never leave the machine",
  "the checkout flow a/b test runs until the 15th with a 50/50 split",
  "error budgets reset on the first monday of each month for all services",
  "the mobile team pins react native upgrades to one minor version per quarter",
];

const QUERIES = [
  "how do we deploy",
  "key rotation policy",
  "api rate limits",
  "database pooling setup",
  "preview environment lifetime",
  "spacing and line width conventions",
  "where are embeddings computed",
  "current a/b tests",
  "error budget schedule",
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]!;

/** Case/punctuation variant of an earlier write → real near-dupe → conflict. */
function nearDupeOf(content: string): string {
  const capped = content.charAt(0).toUpperCase() + content.slice(1);
  return Math.random() < 0.5 ? `${capped}!` : `${capped}.`;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const flag = (name: string): string | undefined => {
    const i = args.indexOf(`--${name}`);
    return i === -1 ? undefined : args[i + 1];
  };
  const seconds = Number(flag("seconds") ?? 120);
  const force = args.includes("--force");

  const { dbPath, scope } = resolveStore();
  // The real global store, ignoring any NORN_DB_PATH override (defaultDbPath()
  // honors the override, which would make this guard compare a path to itself).
  const globalDb = path.join(os.homedir(), NORN_DIR, DB_FILENAME);
  if (path.resolve(dbPath) === path.resolve(globalDb) && !force) {
    console.error(
      `simulate: refusing to write demo traffic into your global store (${dbPath}).\n` +
        `Set NORN_DB_PATH to a scratch file (same one the dev server uses), or pass --force.`,
    );
    process.exit(1);
  }
  console.log(`simulating against ${dbPath} for ~${seconds}s (ctrl-c to stop)\n`);

  const store = new SqliteStorage({ path: dbPath, embedder: new MiniLMEmbedder(), scope });
  const written: Array<{ content: string; project: string }> = [];
  const deadline = Date.now() + seconds * 1000;
  let n = 0;

  try {
    while (Date.now() < deadline) {
      const agent = pick(AGENTS);
      store.setAgentId(agent);
      const roll = Math.random();

      if (roll < 0.2 && written.length > 2) {
        // near-duplicate of something an agent already wrote → conflict.detected
        const prior = pick(written);
        await store.remember({
          content: nearDupeOf(prior.content),
          project: prior.project,
          tags: ["sim"],
        });
        console.log(`${String(++n).padStart(3)}  ${agent.padEnd(18)} remember (near-dupe!)`);
      } else if (roll < 0.55) {
        const query = pick(QUERIES);
        const hits = await store.recall(query, { limit: 3, scope });
        console.log(`${String(++n).padStart(3)}  ${agent.padEnd(18)} recall "${query}" → ${hits.length}`);
      } else {
        const project = pick(PROJECTS);
        // A dash of uniqueness so independent writes don't collide by accident.
        const content = `${pick(SUBJECTS)} (${randomBytes(2).toString("hex")})`;
        await store.remember({ content, project, tags: ["sim"] });
        written.push({ content, project });
        console.log(`${String(++n).padStart(3)}  ${agent.padEnd(18)} remember [${project}]`);
      }

      await sleep(700 + Math.random() * 600); // ~1 event/sec, watchable
    }
  } finally {
    await store.close();
  }
  console.log(`\ndone — ${n} operations. The rows are real; delete the demo db when finished.`);
}

main().catch((err) => {
  console.error(`simulate failed: ${String(err)}`);
  process.exit(1);
});
