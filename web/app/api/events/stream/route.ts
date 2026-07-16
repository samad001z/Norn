import type { NextRequest } from "next/server";
import { isHostedOnly } from "@/lib/hosted";

// The stream reads the local SQLite store directly (better-sqlite3), so it
// needs the Node runtime, and it must never be prerendered or cached.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const POLL_MS = 400;
/** How much history a fresh connection gets before going live. */
const RECENT_ON_CONNECT = 50;

/**
 * Live agent-activity feed as Server-Sent Events.
 *
 * On connect: the most recent events, then a poll of `listEventsSince(lastId)`
 * every 400ms pushing anything new. `lastId` lives in this handler's closure,
 * so each connection tracks its own cursor. Every frame carries an SSE `id:`,
 * which makes EventSource's automatic reconnect send `Last-Event-ID` back — a
 * resumed connection continues from where it dropped instead of replaying.
 *
 * Same process, same SQLite file as the rest of the dashboard; WAL mode plus
 * busy_timeout make it safe to read while the MCP server or CLI writes from
 * another process.
 */
export async function GET(req: NextRequest) {
  // Same guard as the dashboard page: a hosted deployment never opens a store,
  // so it has no activity to stream.
  if (isHostedOnly()) {
    return new Response("The hosted preview has no local store to stream.", { status: 404 });
  }

  const { listEventsSince } = await import("@/lib/store.server");
  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | undefined;
  const stop = () => {
    if (timer !== undefined) clearInterval(timer);
    timer = undefined;
  };

  // Reconnects resume from the id the client last saw: `?after=` for the
  // hook's own backoff reconnects (EventSource can't set headers), the
  // Last-Event-ID header for the browser's built-in retries.
  const afterParam = Number(req.nextUrl.searchParams.get("after"));
  const resumeFrom =
    Number.isFinite(afterParam) && afterParam > 0
      ? afterParam
      : Number(req.headers.get("last-event-id"));

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let lastId = 0;
      const push = (
        events: Awaited<ReturnType<typeof listEventsSince>>,
        replay = false,
      ) => {
        for (const e of events) {
          lastId = e.id;
          const frame = replay ? { ...e, replay: true } : e;
          controller.enqueue(encoder.encode(`id: ${e.id}\ndata: ${JSON.stringify(frame)}\n\n`));
        }
      };

      try {
        if (Number.isFinite(resumeFrom) && resumeFrom > 0) {
          // Events missed during a reconnect gap are genuinely new — not replay.
          lastId = resumeFrom;
          push(await listEventsSince(lastId));
        } else {
          // Fresh connection: recent history only, but the cursor still starts at
          // the true tail so nothing between "recent" and "now" replays later.
          // Marked `replay` so the client can count them without animating them.
          const all = await listEventsSince(0);
          lastId = all.at(-1)?.id ?? 0;
          push(all.slice(-RECENT_ON_CONNECT), true);
        }
      } catch {
        stop();
        controller.close();
        return;
      }

      let busy = false;
      timer = setInterval(async () => {
        if (busy) return;
        busy = true;
        try {
          push(await listEventsSince(lastId));
        } catch {
          // Client gone (enqueue on a closed controller) or store hiccup:
          // either way this connection is done.
          stop();
          try {
            controller.close();
          } catch {
            // Already closed by the disconnect itself.
          }
        } finally {
          busy = false;
        }
      }, POLL_MS);
    },
    cancel() {
      stop();
    },
  });

  // cancel() covers reader-side teardown; the abort signal covers the socket
  // dropping. Either way the poll loop must not outlive the connection.
  req.signal.addEventListener("abort", stop);

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
