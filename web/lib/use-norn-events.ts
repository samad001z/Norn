"use client";

import { useEffect, useMemo, useRef, useState } from "react";
// Type-only import: erased at compile time, so none of core's native modules
// (better-sqlite3) ever reach the client bundle.
import type { AgentEvent, EventKind } from "@samad001z/norn-core";

/** Rolling window kept in memory; older events fall off the front. */
const MAX_EVENTS = 200;

// ── transport tuning ──────────────────────────────────────────────────────────
/** Consecutive SSE failures before demoting to fetch-polling. */
const SSE_MAX_FAILURES = 3;
/** First reconnect delay; doubles per failure. */
const RETRY_BASE_MS = 1_000;
/** Cap on any backoff delay (reconnect or degraded polling). */
const RETRY_MAX_MS = 15_000;
/** Polling cadence once demoted. */
const POLL_MS = 2_000;
/** While polling, how long before trying to climb back to the live stream. */
const SSE_REATTEMPT_MS = 45_000;

/**
 * An event as delivered by the stream. `replay` marks backlog frames sent on a
 * fresh connection — history for counters and feeds, but not new activity, so
 * visualizations should not animate them.
 */
export type LiveAgentEvent = AgentEvent & { replay?: boolean };

/** How events are currently arriving. */
export type Transport =
  /** Between attempts: nothing is flowing right now. */
  | "connecting"
  /** The EventSource is open — pushed frames, no polling. */
  | "sse"
  /** SSE gave up; events arrive by polling `/api/events` instead. */
  | "polling";

/** One agent's presence in the feed, derived from the events it produced. */
export interface AgentActivity {
  /** Raw agent id, or null when events arrived unattributed. */
  agentId: string | null;
  /** Events seen from this agent in the current window. */
  events: number;
  /** ISO timestamp of its most recent event. */
  lastSeen: string;
  /** What it did last. */
  lastKind: EventKind;
  /** Model the agent reported (`event.model`), or null if it never did. */
  model: string | null;
  /** The agent's most recent event in full, for previews. */
  last: LiveAgentEvent;
}

export interface NornEvents {
  /** Rolling window of events, oldest first (append order), capped at {@link MAX_EVENTS}. */
  events: LiveAgentEvent[];
  /** Active agents keyed by agentId (unattributed events group under "unknown"). */
  agents: Record<string, AgentActivity>;
  /** Event counts by kind over the current window. */
  counts: Partial<Record<EventKind, number>>;
  /** Whether events are flowing (over SSE or polling). */
  connected: boolean;
  /** Which path events are arriving on right now. */
  transport: Transport;
}

/**
 * Live agent activity from `/api/events/stream`.
 *
 * Reconnects are ours, not the browser's: on error the EventSource is closed
 * and reopened with exponential backoff, resuming via `?after=<last id>` so a
 * reconnect never replays what was already applied. After
 * {@link SSE_MAX_FAILURES} consecutive failures the hook demotes itself to
 * polling `/api/events` (same cursor, same frames), backing off further when
 * polls fail too, and periodically retries the stream to climb back up. The id
 * guard makes every path exactly-once — including dev-mode strict effects
 * mounting twice.
 */
export function useNornEvents(): NornEvents {
  const [events, setEvents] = useState<LiveAgentEvent[]>([]);
  const [transport, setTransport] = useState<Transport>("connecting");
  // Highest event id ever applied — survives re-renders and reconnects.
  const lastIdRef = useRef(0);

  useEffect(() => {
    let disposed = false;
    let source: EventSource | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let sseFailures = 0;

    const apply = (event: LiveAgentEvent): void => {
      if (event.id <= lastIdRef.current) return;
      lastIdRef.current = event.id;
      setEvents((prev) =>
        prev.length >= MAX_EVENTS ? [...prev.slice(1), event] : [...prev, event],
      );
    };

    const openSse = (): void => {
      if (disposed) return;
      // Resume from the last applied id so a manual reconnect continues the
      // tail instead of replaying the connect backlog.
      const cursor = lastIdRef.current;
      source = new EventSource(
        cursor > 0 ? `/api/events/stream?after=${cursor}` : "/api/events/stream",
      );
      source.onopen = () => {
        sseFailures = 0;
        setTransport("sse");
      };
      source.onmessage = (msg) => {
        let event: LiveAgentEvent;
        try {
          event = JSON.parse(msg.data) as LiveAgentEvent;
        } catch {
          return; // A malformed frame is dropped, never breaks the feed.
        }
        apply(event);
      };
      source.onerror = () => {
        source?.close();
        source = null;
        sseFailures += 1;
        if (sseFailures >= SSE_MAX_FAILURES) {
          startPolling();
          return;
        }
        setTransport("connecting");
        const delay = Math.min(RETRY_BASE_MS * 2 ** (sseFailures - 1), RETRY_MAX_MS);
        timer = setTimeout(openSse, delay);
      };
    };

    const startPolling = (): void => {
      if (disposed) return;
      setTransport("polling");
      const demotedAt = Date.now();
      let misses = 0;

      const tick = async (): Promise<void> => {
        if (disposed) return;
        try {
          const res = await fetch(`/api/events?after=${lastIdRef.current}`, {
            cache: "no-store",
          });
          if (!res.ok) throw new Error(String(res.status));
          const body = (await res.json()) as { events?: LiveAgentEvent[] };
          for (const e of body.events ?? []) apply(e);
          misses = 0;
          setTransport("polling");
        } catch {
          misses += 1;
          // A couple of failed polls in a row means nothing is flowing —
          // say so instead of pretending to be live.
          if (misses >= 2) setTransport("connecting");
        }
        if (disposed) return;
        if (Date.now() - demotedAt >= SSE_REATTEMPT_MS) {
          // Polling was only ever the fallback: give the stream another shot.
          sseFailures = 0;
          openSse();
          return;
        }
        timer = setTimeout(() => void tick(), Math.min(POLL_MS * 2 ** misses, RETRY_MAX_MS));
      };
      void tick();
    };

    openSse();
    return () => {
      disposed = true;
      source?.close();
      if (timer !== undefined) clearTimeout(timer);
    };
  }, []);

  const { agents, counts } = useMemo(() => {
    const agents: Record<string, AgentActivity> = {};
    const counts: Partial<Record<EventKind, number>> = {};
    for (const e of events) {
      counts[e.kind] = (counts[e.kind] ?? 0) + 1;
      // First-class field on the read shape; detail.model kept as a fallback
      // for frames from older detail-only writers.
      const model =
        e.model ??
        (typeof e.detail?.model === "string" && e.detail.model ? e.detail.model : null);
      const key = e.agentId ?? "unknown";
      const a = agents[key];
      if (a) {
        a.events += 1;
        a.lastSeen = e.ts;
        a.lastKind = e.kind;
        a.last = e;
        if (model) a.model = model;
      } else {
        agents[key] = {
          agentId: e.agentId,
          events: 1,
          lastSeen: e.ts,
          lastKind: e.kind,
          model,
          last: e,
        };
      }
    }
    return { agents, counts };
  }, [events]);

  return { events, agents, counts, connected: transport !== "connecting", transport };
}
