import { Dashboard } from "@/components/dashboard";
import type { Memory } from "@/components/memory-card";

// Reads the local store at request time; never prerendered at build.
export const dynamic = "force-dynamic";

export default async function AppPage() {
  // The dashboard reads a local SQLite store. On a hosted deploy (e.g. Vercel)
  // there is no local store, so render a hosted preview and never load the
  // native store at runtime.
  if (process.env.VERCEL) {
    return <Dashboard initialMemories={[]} hosted />;
  }

  let memories: Memory[] = [];
  try {
    const { listMemories } = await import("@/lib/store.server");
    memories = await listMemories();
  } catch {
    // Store unavailable (first run, permissions, etc.) — start empty.
    memories = [];
  }
  return <Dashboard initialMemories={memories} />;
}
