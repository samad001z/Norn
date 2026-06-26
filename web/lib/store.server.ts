import "server-only";

import path from "node:path";
import { promises as fs } from "node:fs";
import {
  MiniLMEmbedder,
  SqliteStorage,
  parseMetadata,
  resolveStore,
  stalenessScore,
  type Memory as CoreMemory,
  type StalenessLevel,
} from "@samad001z/norn-core";

/** The memory shape the dashboard UI consumes. */
export interface UiMemory {
  id: string;
  content: string;
  tags: string[];
  project: string | null;
  updatedAt: string;
  /**
   * Computed freshness level (fresh / aging / stale), derived on the fly from the
   * memory's age and recall stats. Never stored — it reflects the moment it was read.
   */
  staleness: StalenessLevel;
  /** Ids of memories this one may contradict (from metadata.possible_conflict_with). */
  conflictsWith: string[];
}

// Demo seed. The store's injectable clock gives each one a realistic age so
// the dashboard reads naturally on first run.
const SEED: Array<{ content: string; tags: string[]; project: string | null; hoursAgo: number }> = [
  { content: "Embeddings sit behind a swappable Embedder interface. The default HashEmbedder is a placeholder, not semantic.", tags: ["architecture", "embeddings"], project: "norn-core", hoursAgo: 2 },
  { content: "recall blends semantic similarity with recency, then trims results to a token budget.", tags: ["recall", "ranking"], project: "norn-core", hoursAgo: 26 },
  { content: "Rotate the signing keys every 90 days. The job lives in infra/rotate-keys.", tags: ["security", "ops"], project: "atlas-api", hoursAgo: 74 },
  { content: "Rate limit is 600 requests per minute per token, bursting to 1000.", tags: ["limits"], project: "atlas-api", hoursAgo: 120 },
  { content: "Deploy to prod from the main branch on Vercel. Every pull request gets a preview deploy.", tags: ["deploy", "ops"], project: "harbor-web", hoursAgo: 5 },
  { content: "The team prefers tabs over spaces and a 100 character line width.", tags: ["style"], project: "harbor-web", hoursAgo: 190 },
  { content: "Name things by what the user controls, not the implementation. Forget a memory, not delete a vector.", tags: ["writing"], project: null, hoursAgo: 50 },
  { content: "Keep commits small and put the why in the body.", tags: ["workflow"], project: null, hoursAgo: 300 },
];

// Module-level singletons. Created lazily so nothing opens the database at
// build time (the page that uses this is force-dynamic).
let store: SqliteStorage | null = null;
const clock = { ms: Date.now() };
let seedChecked = false;

function getStore(): SqliteStorage {
  if (!store) {
    const { dbPath, scope } = resolveStore();
    store = new SqliteStorage({
      // Project-aware: when the dashboard is launched inside a project that ran
      // `norn init`, it reads that project's store. NORN_DB_PATH still wins.
      // The dashboard intentionally lists across all scopes (it shows the whole
      // store it opened), so it never passes a scope filter to list().
      path: dbPath,
      embedder: new MiniLMEmbedder(),
      scope,
      now: () => new Date(clock.ms),
    });
  }
  return store;
}

function toUi(m: CoreMemory, now: Date): UiMemory {
  return {
    id: m.id,
    content: m.content,
    tags: m.tags,
    project: m.project,
    updatedAt: m.updatedAt,
    staleness: stalenessScore(m, now),
    conflictsWith: parseMetadata(m.metadata).possible_conflict_with ?? [],
  };
}

async function seedIfEmpty(s: SqliteStorage): Promise<void> {
  if (seedChecked) return;
  seedChecked = true;
  const existing = await s.list({ limit: 1 });
  if (existing.length > 0) return;
  for (const item of SEED) {
    clock.ms = Date.now() - item.hoursAgo * 3600_000;
    await s.remember({ content: item.content, tags: item.tags, project: item.project });
  }
  clock.ms = Date.now();
}

export async function listMemories(): Promise<UiMemory[]> {
  const s = getStore();
  await seedIfEmpty(s);
  const all = await s.list();
  // Staleness is read-time: compute every memory's level against one "now" so the
  // whole list is classified consistently for this request.
  const now = new Date(clock.ms);
  return all.map((m) => toUi(m, now));
}

export async function forgetMemory(id: string): Promise<boolean> {
  return getStore().forget(id);
}

/** "Keep both": clear the possible-conflict link between two memories. */
export async function resolveConflict(idA: string, idB: string): Promise<void> {
  return getStore().resolveConflict(idA, idB);
}

/** Persist an early-access signup. Placeholder sink (a real app routes to a CRM). */
export async function saveEmail(email: string): Promise<void> {
  const dir = path.join(process.cwd(), ".data");
  await fs.mkdir(dir, { recursive: true });
  const line = JSON.stringify({ email, at: new Date().toISOString() }) + "\n";
  await fs.appendFile(path.join(dir, "early-access.jsonl"), line, "utf8");
}
