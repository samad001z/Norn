import { Dashboard } from "@/components/dashboard";
import type { Memory } from "@/components/memory-card";
import { isHostedOnly } from "@/lib/hosted";

// Reads the local store at request time; never prerendered at build.
export const dynamic = "force-dynamic";

export default async function AppPage() {
  // Hosted previews (see lib/hosted.ts) never open a store; local runs — dev or
  // a local production build — load the real one with zero configuration.
  if (isHostedOnly()) {
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
