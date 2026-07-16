import "server-only";

/**
 * Whether this deployment is a hosted preview with no local store to open.
 *
 * The dashboard reads a LOCAL, single-tenant SQLite store — it is meant to run
 * on your own machine against your own memories, never as a shared multi-user
 * service. Hosted mode renders an empty preview and never opens a store, so a
 * public host can't serve one machine's memories to every visitor.
 *
 * Hosted is an explicit signal, not an inference from NODE_ENV: Vercel sets
 * VERCEL, and any other public deployment must set NORN_DASHBOARD_HOSTED=1.
 * Everything else — `next dev` AND a local `next build && next start` — is
 * local-first and opens the real store with zero configuration.
 */
export function isHostedOnly(): boolean {
  return !!process.env.VERCEL || process.env.NORN_DASHBOARD_HOSTED === "1";
}
