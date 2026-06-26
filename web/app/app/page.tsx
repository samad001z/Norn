import { Dashboard } from "@/components/dashboard";
import type { Memory } from "@/components/memory-card";

// Reads the local store at request time; never prerendered at build.
export const dynamic = "force-dynamic";

export default async function AppPage() {
  // The dashboard reads a LOCAL, single-tenant SQLite store — it is meant to run
  // on your own machine against your own memories, never as a shared multi-user
  // service. So it is safe-by-default: any production deployment renders an empty
  // hosted preview and never opens a store. This prevents a public host (Vercel or
  // anything else) from serving one server's memories to every visitor.
  //
  // Local use is unaffected: `npm run dev` is development, so it loads your store.
  // A deliberate local self-host (`next start` on your own box) can opt back in
  // with NORN_DASHBOARD_LOCAL=1.
  const hostedOnly =
    !!process.env.VERCEL ||
    (process.env.NODE_ENV === "production" && process.env.NORN_DASHBOARD_LOCAL !== "1");
  if (hostedOnly) {
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
