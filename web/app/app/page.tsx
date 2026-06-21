import { Dashboard } from "@/components/dashboard";
import { listMemories } from "@/lib/store.server";

// Reads the local store at request time; never prerendered at build.
export const dynamic = "force-dynamic";

export default async function AppPage() {
  const memories = await listMemories();
  return <Dashboard initialMemories={memories} />;
}
