// Which memories are still flagged as possibly conflicting, straight from the
// local store's metadata. The live view joins this against `conflict.detected`
// events to show which agents are waiting on a human decision — resolving in
// the dashboard clears the flag, and with it the "needs you" entry.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { isHostedOnly } from "@/lib/hosted";

export async function GET() {
  // Same guard as the stream: hosted deployments have no store.
  if (isHostedOnly()) {
    return Response.json({ conflicts: {} }, { status: 404 });
  }

  const { listConflictFlags } = await import("@/lib/store.server");
  return Response.json({ conflicts: await listConflictFlags() });
}
