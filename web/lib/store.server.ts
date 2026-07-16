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
  /** Project root the memory was written under, or null for global. Shown in detail. */
  scope: string | null;
  createdAt: string;
  updatedAt: string;
  /**
   * Computed freshness level (fresh / aging / stale), derived on the fly from the
   * memory's age and recall stats. Never stored — it reflects the moment it was read.
   */
  staleness: StalenessLevel;
  /** Ids of memories this one may contradict (from metadata.possible_conflict_with). */
  conflictsWith: string[];
}

// Module-level singleton. Created lazily so nothing opens the database at
// build time (the page that uses this is force-dynamic).
let store: SqliteStorage | null = null;

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
    scope: m.scope,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
    staleness: stalenessScore(m, now),
    conflictsWith: parseMetadata(m.metadata).possible_conflict_with ?? [],
  };
}

export async function listMemories(): Promise<UiMemory[]> {
  const all = await getStore().list();
  // Staleness is read-time: compute every memory's level against one "now" so the
  // whole list is classified consistently for this request.
  const now = new Date();
  return all.map((m) => toUi(m, now));
}

export async function forgetMemory(id: string): Promise<boolean> {
  return getStore().forget(id);
}

/** Add a memory from the dashboard. Returns the stored row in UI shape. */
export async function addMemory(input: {
  content: string;
  project: string | null;
  tags: string[];
}): Promise<UiMemory> {
  const s = getStore();
  const m = await s.remember({
    content: input.content,
    project: input.project,
    tags: input.tags,
  });
  return toUi(m, new Date());
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
