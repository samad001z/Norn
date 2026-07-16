import type { NextRequest } from "next/server";
import { isHostedOnly } from "@/lib/hosted";

// Plain-JSON fallback for the SSE stream: same store, same frames, fetched on
// an interval by the client when EventSource can't hold a connection. Reads
// the local SQLite store directly, so Node runtime, never prerendered.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** How much history a fresh poller (no cursor yet) gets, matching the stream. */
const RECENT_ON_CONNECT = 50;

/**
 * `GET /api/events?after=<id>` — events with id greater than `after`, oldest
 * first. With no cursor (or `after=0`) it behaves like a fresh stream connect:
 * only the most recent events, marked `replay` so the client counts them
 * without animating them.
 */
export async function GET(req: NextRequest) {
  // Same guard as the stream: a hosted deployment never opens a store, so it
  // has no activity to serve.
  if (isHostedOnly()) {
    return Response.json({ events: [] }, { status: 404 });
  }

  const { listEventsSince } = await import("@/lib/store.server");
  const afterParam = Number(req.nextUrl.searchParams.get("after"));
  const after = Number.isFinite(afterParam) && afterParam > 0 ? afterParam : 0;
  const all = await listEventsSince(after);
  const events =
    after > 0 ? all : all.slice(-RECENT_ON_CONNECT).map((e) => ({ ...e, replay: true }));
  return Response.json({ events });
}
