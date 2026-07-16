"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Radio } from "lucide-react";
import type { AgentEvent, EventKind } from "@samad001z/norn-core";
import {
  useNornEvents,
  type AgentActivity,
  type LiveAgentEvent,
  type Transport,
} from "@/lib/use-norn-events";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  glyphForModel,
  glyphPath2D,
  ModelGlyphIcon,
  type ModelGlyph,
} from "@/components/live/model-glyphs";

/*
 * The well, live. Every sprite is a real agent from the event stream; every
 * pulse is a real read or write against the store. Nothing here is mocked,
 * random, or decorative-only — the canvas is a faithful projection of
 * useNornEvents(), which is a faithful projection of the events table.
 */

// ── palette (mirrors globals.css — canvas can't read Tailwind tokens) ────────
const WELL = "#0a0e13";
const SILT = "#1b2430";
const MIST = "#d6dee7";
const FATHOM = "#73808f";
const CANDLE = "#e9b87a";
const EMBER = "#c9924e";
const FILAMENT = "#f6dcab";
/** Write pulse: sea-glass green — alive, but muted enough for this dark water. */
const SEAGLASS = "#6fcf9f";
/** Conflict flash: the dashboard's rosewood destructive, never neon. */
const ROSEWOOD = "#c76b61";

// ── tuning ────────────────────────────────────────────────────────────────────
const DIVE_S = 0.85; // seconds to reach the core
const HOLD_S = 0.22; // pause at depth
const RETURN_S = 1.05; // drift back out
const RECALL_DEPTH = 0.38; // recalls lean toward the core, they don't touch it
const MAX_TRAIL = 480; // hard cap on trail particles
const MAX_PULSES = 24; // hard cap on live rings
const FEED_LENGTH = 8;
const GLYPH_MAP_PX = 18; // model glyph size on the map (legibility floor)

// ── deterministic identity color ─────────────────────────────────────────────
/** FNV-1a — tiny, stable, good spread for short ids. */
function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * An agent's color comes from who it is, nothing else: same id, same color,
 * every session, every machine. A `model` tag in the event detail wins over
 * the raw agentId when present. Hues steer around rosewood's red band, which
 * is reserved for conflicts.
 */
function agentColor(key: string): string {
  const h = hash32(key);
  const hue = 130 + (h % 205); // 130°–335°: greens → blues → violets, no reds
  const sat = 42 + ((h >>> 8) % 18); // muted, never neon
  const light = 62 + ((h >>> 16) % 14);
  return `hsl(${hue} ${sat}% ${light}%)`;
}

function colorKeyOf(e: AgentEvent): string {
  if (e.model) return e.model;
  // Fallback for frames from older detail-only writers.
  const model = e.detail?.model;
  if (typeof model === "string" && model) return model;
  return e.agentId ?? "unknown";
}

// ── simulation state (lives in refs — never triggers React renders) ──────────
type SpriteState = "spawning" | "idle" | "diving" | "holding" | "returning";

interface Sprite {
  key: string;
  label: string;
  color: string;
  angle: number; // rest position on the outer ring
  drift: number; // radians/sec, direction from the id hash
  phase: number; // per-agent bob offset
  model: string | null; // last model this agent reported
  glyph: ModelGlyph | null; // resolved mark; null = plain creature sprite
  state: SpriteState;
  progress: number; // 0 = rest ring, 1 = full depth
  depth: number; // how deep the current action goes (recall < write)
  hold: number;
  spawn: number; // fade-in
  glow: number; // brief brightening after any action
  queue: Array<{ kind: EventKind }>;
  x: number;
  y: number;
}

interface Pulse {
  x: number;
  y: number;
  age: number;
  life: number;
  radius: number;
  color: string;
  width: number;
}

interface TrailDot {
  x: number;
  y: number;
  life: number;
  color: string;
}

interface Sim {
  sprites: Map<string, Sprite>;
  pulses: Pulse[];
  trail: TrailDot[];
  flash: number; // conflict screen-tint, decays
  coreKick: number; // core swells briefly when a write lands
}

function makeSprite(key: string): Sprite {
  const h = hash32(key);
  return {
    key,
    label: key.length > 14 ? `${key.slice(0, 13)}…` : key,
    color: agentColor(key),
    angle: ((h % 3600) / 3600) * Math.PI * 2,
    drift: (h & 1 ? 1 : -1) * (0.05 + ((h >>> 4) % 40) / 1000),
    phase: ((h >>> 12) % 628) / 100,
    model: null,
    glyph: null,
    state: "spawning",
    progress: 0,
    depth: 1,
    hold: 0,
    spawn: 0,
    glow: 0,
    queue: [],
    x: 0,
    y: 0,
  };
}

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

function pushPulse(sim: Sim, p: Pulse): void {
  if (sim.pulses.length >= MAX_PULSES) sim.pulses.shift();
  sim.pulses.push(p);
}

/** Feed one real event into the simulation. */
function ingest(sim: Sim, e: LiveAgentEvent): void {
  const key = colorKeyOf(e);
  let sprite = sim.sprites.get(key);
  if (!sprite) {
    sprite = makeSprite(key);
    sim.sprites.set(key, sprite);
  }
  // The glyph follows event.model (never the agentId), so an agent that stops
  // or starts reporting a model changes its mark. Set before the replay guard:
  // history is enough to know who wears which mark.
  const model =
    e.model ?? (typeof e.detail?.model === "string" && e.detail.model ? e.detail.model : null);
  if (model !== sprite.model) {
    sprite.model = model;
    sprite.glyph = glyphForModel(model);
  }
  // Backlog replayed on connect is history: the agent takes its place on the
  // ring and the counters/feed count it, but only live events dive and pulse.
  if (e.replay) return;
  if (e.kind === "conflict.detected") {
    // A finding, not a journey: the water itself reacts, immediately.
    sim.flash = Math.min(1, sim.flash + 0.85);
    sprite.glow = 1;
    return;
  }
  if (sprite.queue.length < 4) sprite.queue.push({ kind: e.kind });
}

/** Arrival effect at depth, by what the agent actually did. */
function arrive(sim: Sim, sprite: Sprite, kind: EventKind, cx: number, cy: number): void {
  if (kind === "remember") {
    sim.coreKick = 1;
    pushPulse(sim, { x: cx, y: cy, age: 0, life: 1.3, radius: 130, color: SEAGLASS, width: 2.2 });
    pushPulse(sim, { x: cx, y: cy, age: -0.12, life: 1.5, radius: 190, color: SEAGLASS, width: 1.2 });
  } else if (kind === "forget") {
    sim.coreKick = 0.6;
    pushPulse(sim, { x: cx, y: cy, age: 0, life: 1.2, radius: 140, color: EMBER, width: 1.6 });
  } else {
    // recall — a lighter pulse: candlelight, from where the agent leaned in.
    pushPulse(sim, {
      x: sprite.x,
      y: sprite.y,
      age: 0,
      life: 1.0,
      radius: 70,
      color: CANDLE,
      width: 1.2,
    });
    pushPulse(sim, { x: cx, y: cy, age: 0, life: 1.1, radius: 90, color: MIST, width: 0.8 });
  }
  sprite.glow = 1;
}

// ── the component ─────────────────────────────────────────────────────────────

export function LiveView({ hosted = false }: { hosted?: boolean }) {
  const { events, agents, counts, connected, transport } = useNornEvents();
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const simRef = React.useRef<Sim>({
    sprites: new Map(),
    pulses: [],
    trail: [],
    flash: 0,
    coreKick: 0,
  });
  const seenRef = React.useRef(0);
  const [inFlight, setInFlight] = React.useState(0);

  // New events → simulation. The id cursor makes this exactly-once even when
  // the events array re-renders or the stream replays.
  React.useEffect(() => {
    for (const e of events) {
      if (e.id <= seenRef.current) continue;
      seenRef.current = e.id;
      ingest(simRef.current, e);
    }
  }, [events]);

  // The render loop: one rAF, sized by ResizeObserver, torn down on unmount.
  React.useEffect(() => {
    if (hosted) return;
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let w = 0;
    let h = 0;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = wrap.clientWidth;
      h = wrap.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(wrap);

    let raf = 0;
    let last = performance.now();
    let flying = 0;

    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const t = now / 1000;
      const sim = simRef.current;
      const cx = w / 2;
      const cy = h / 2;
      const ring = Math.max(Math.min(w, h) / 2 - 72, 110);

      // ── update ──────────────────────────────────────────────────────────
      let nowFlying = 0;
      for (const s of sim.sprites.values()) {
        if (s.spawn < 1) s.spawn = Math.min(1, s.spawn + dt * 1.6);
        if (s.glow > 0) s.glow = Math.max(0, s.glow - dt * 1.4);

        if (s.state === "spawning" && s.spawn >= 1) s.state = "idle";
        if (s.state === "idle" && s.queue.length > 0) {
          const next = s.queue.shift()!;
          s.state = "diving";
          s.depth = next.kind === "recall" ? RECALL_DEPTH : 1;
          (s as Sprite & { pendingKind?: EventKind }).pendingKind = next.kind;
          s.progress = 0;
        }
        if (s.state === "diving") {
          s.progress = Math.min(1, s.progress + dt / (reduced ? 0.01 : DIVE_S));
          if (s.progress >= 1) {
            s.state = "holding";
            s.hold = HOLD_S;
            const kind = (s as Sprite & { pendingKind?: EventKind }).pendingKind ?? "remember";
            arrive(sim, s, kind, cx, cy);
          }
        } else if (s.state === "holding") {
          s.hold -= dt;
          if (s.hold <= 0) s.state = "returning";
        } else if (s.state === "returning") {
          s.progress = Math.max(0, s.progress - dt / (reduced ? 0.01 : RETURN_S));
          if (s.progress <= 0) s.state = "idle";
        } else if (!reduced) {
          s.angle += s.drift * dt;
        }
        if (s.state === "diving" || s.state === "holding" || s.state === "returning") nowFlying++;

        const bob = reduced ? 0 : Math.sin(t * 0.6 + s.phase) * 6;
        const rx = cx + Math.cos(s.angle) * (ring + bob);
        const ry = cy + Math.sin(s.angle) * (ring + bob);
        const p = easeInOut(s.progress) * s.depth;
        s.x = rx + (cx - rx) * p;
        s.y = ry + (cy - ry) * p;

        // Trails only while actually moving, and hard-capped.
        if (!reduced && s.state !== "idle" && s.state !== "spawning") {
          if (sim.trail.length >= MAX_TRAIL) sim.trail.shift();
          sim.trail.push({ x: s.x, y: s.y, life: 1, color: s.color });
        }
      }
      if (nowFlying !== flying) {
        flying = nowFlying;
        setInFlight(nowFlying);
      }

      for (const d of sim.trail) d.life -= dt * (reduced ? 8 : 1.8);
      while (sim.trail.length && sim.trail[0]!.life <= 0) sim.trail.shift();
      for (const p of sim.pulses) p.age += dt * (reduced ? 6 : 1);
      sim.pulses = sim.pulses.filter((p) => p.age < p.life);
      sim.flash = Math.max(0, sim.flash - dt * (reduced ? 8 : 1.1));
      sim.coreKick = Math.max(0, sim.coreKick - dt * 2.2);

      // ── draw ────────────────────────────────────────────────────────────
      ctx.clearRect(0, 0, w, h);

      // depth rings — the well's contour lines
      ctx.strokeStyle = SILT;
      for (const [r, a] of [
        [ring, 0.55],
        [ring * 0.66, 0.4],
        [ring * 0.33, 0.3],
      ] as const) {
        ctx.globalAlpha = a;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // filaments: each agent tethered to the core, brighter while in flight
      for (const s of sim.sprites.values()) {
        const active = s.state !== "idle" && s.state !== "spawning";
        ctx.globalAlpha = (active ? 0.22 : 0.05) * s.spawn;
        ctx.strokeStyle = s.color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(cx, cy);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // trails
      for (const d of sim.trail) {
        ctx.globalAlpha = d.life * 0.3;
        ctx.fillStyle = d.color;
        ctx.beginPath();
        ctx.arc(d.x, d.y, 1.2 + d.life * 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // the core — candlelight over dark water, breathing
      const breath = reduced ? 0 : Math.sin(t * 0.9) * 0.5 + 0.5;
      const kick = sim.coreKick;
      const glowR = 44 + breath * 6 + kick * 26;
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR);
      glow.addColorStop(0, `rgba(233,184,122,${0.34 + kick * 0.3})`);
      glow.addColorStop(0.55, "rgba(233,184,122,0.10)");
      glow.addColorStop(1, "rgba(233,184,122,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, glowR, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = FILAMENT;
      ctx.beginPath();
      ctx.arc(cx, cy, 5.5 + kick * 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = CANDLE;
      ctx.globalAlpha = 0.5 + kick * 0.4;
      ctx.beginPath();
      ctx.arc(cx, cy, 15 + breath * 1.5 + kick * 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;

      // pulses — real reads and writes, rippling out
      for (const p of sim.pulses) {
        if (p.age < 0) continue;
        const k = p.age / p.life;
        ctx.globalAlpha = (1 - k) * 0.65;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.width * (1 - k * 0.5);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 10 + k * p.radius, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // agents
      ctx.font = "500 10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      for (const s of sim.sprites.values()) {
        const a = s.spawn;
        ctx.globalAlpha = 0.28 * a + s.glow * 0.35;
        ctx.fillStyle = s.color;
        ctx.beginPath();
        ctx.arc(s.x, s.y, 9 + s.glow * 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = a;
        if (s.glyph) {
          // Model glyph as the sprite body: 18px keeps every mark's silhouette
          // legible while staying inside the 18–28px halo.
          const scale = GLYPH_MAP_PX / 24;
          ctx.save();
          ctx.translate(s.x - GLYPH_MAP_PX / 2, s.y - GLYPH_MAP_PX / 2);
          ctx.scale(scale, scale);
          ctx.fill(glyphPath2D(s.glyph), s.glyph.fillRule ?? "nonzero");
          ctx.restore();
        } else {
          // No model reported (or unrecognized): the plain creature sprite.
          ctx.beginPath();
          ctx.arc(s.x, s.y, 3.4, 0, Math.PI * 2);
          ctx.fill();
        }
        // label, pushed outward from the core so it never sits under the body
        const dx = s.x - cx;
        const dy = s.y - cy;
        const len = Math.hypot(dx, dy) || 1;
        const push = s.glyph ? 16 : 14;
        ctx.globalAlpha = a * (s.state === "idle" ? 0.6 : 0.9);
        ctx.fillStyle = s.state === "idle" ? FATHOM : MIST;
        ctx.textAlign = dx >= 0 ? "left" : "right";
        ctx.fillText(s.label, s.x + (dx / len) * push, s.y + (dy / len) * push + 3);
      }
      ctx.globalAlpha = 1;

      // conflict flash — the whole surface stains rosewood for a beat
      if (sim.flash > 0) {
        ctx.globalAlpha = sim.flash * 0.09;
        ctx.fillStyle = ROSEWOOD;
        ctx.fillRect(0, 0, w, h);
        ctx.globalAlpha = Math.min(1, sim.flash) * 0.7;
        ctx.strokeStyle = ROSEWOOD;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, 26 + (1 - sim.flash) * 90, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [hosted]);

  // ── derived DOM state (all from the hook — no invented numbers) ────────────
  const agentCount = Object.keys(agents).length;
  const memoriesWritten = counts.remember ?? 0;
  const conflictsSeen = counts["conflict.detected"] ?? 0;
  const feed = React.useMemo(() => events.slice(-FEED_LENGTH).reverse(), [events]);
  const agentList = React.useMemo(
    () => Object.values(agents).sort((a, b) => (a.lastSeen < b.lastSeen ? 1 : -1)),
    [agents],
  );

  // Unresolved conflicts: a `conflict.detected` finding stays open while the
  // memory it flagged still carries its possible-conflict link — the dashboard's
  // resolve clears the link, and the next poll clears the panel. The flags come
  // from the store via /api/conflicts: on mount, whenever a new conflict event
  // arrives (the count bump re-runs the effect), and on a slow safety interval.
  const [conflictFlags, setConflictFlags] = React.useState<Record<string, string[]>>({});
  React.useEffect(() => {
    if (hosted) return;
    let stale = false;
    const load = async () => {
      try {
        const res = await fetch("/api/conflicts", { cache: "no-store" });
        if (!res.ok) return;
        const body = (await res.json()) as { conflicts?: Record<string, string[]> };
        if (!stale) setConflictFlags(body.conflicts ?? {});
      } catch {
        // Offline or store hiccup — keep the last known flags.
      }
    };
    void load();
    const timer = setInterval(() => void load(), 15_000);
    return () => {
      stale = true;
      clearInterval(timer);
    };
  }, [hosted, conflictsSeen]);

  const needsYou = React.useMemo<OpenConflict[]>(() => {
    const byAgent = new Map<string, OpenConflict>();
    // Newest first, so each agent's entry carries its most recent finding.
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i]!;
      if (e.kind !== "conflict.detected") continue;
      // Near-duplicates resolved themselves (the write deduped into the existing
      // row); only contradictions wait on a human.
      if (e.detail?.reason !== "contradiction") continue;
      if (!e.memoryId || !conflictFlags[e.memoryId]?.length) continue;
      const key = e.agentId ?? "unknown";
      const entry = byAgent.get(key);
      if (entry) entry.open += 1;
      else byAgent.set(key, { key, agentId: e.agentId, event: e, open: 1 });
    }
    return [...byAgent.values()];
  }, [events, conflictFlags]);

  return (
    <div className="flex min-h-[100dvh] flex-col bg-well text-mist">
      {/* ── header: nav + live stats ── */}
      <header className="z-10 flex flex-wrap items-center gap-x-5 gap-y-3 border-b border-silt bg-well/85 px-5 py-3 backdrop-blur-md">
        <Link
          href="/app"
          className="inline-flex items-center gap-2 rounded font-mono text-[0.72rem] text-fathom outline-none transition-colors hover:text-mist focus-visible:ring-2 focus-visible:ring-candle/30"
        >
          <ArrowLeft className="size-3.5" />
          Dashboard
        </Link>
        <span className="hidden h-4 w-px bg-silt sm:block" aria-hidden />
        <span className="inline-flex items-center gap-2 font-mono text-[0.66rem] uppercase tracking-[0.22em] text-ember">
          <span aria-hidden className="h-px w-5 bg-ember/50" />
          The well, live
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-x-5 gap-y-2">
          <HeaderStat label="Agents" value={agentCount} />
          <HeaderStat label="In flight" value={inFlight} accent={inFlight > 0} />
          <HeaderStat label="Memories" value={memoriesWritten} />
          <HeaderStat label="Conflicts" value={conflictsSeen} warn={conflictsSeen > 0} />
          <span
            className="inline-flex items-center gap-1.5 font-mono text-[0.66rem] text-fathom"
            style={{ color: connected ? SEAGLASS : undefined }}
            role="status"
            aria-live="polite"
          >
            <Radio className={cn("size-3", connected && "animate-norn-pulse")} />
            {TRANSPORT_LABEL[transport]}
          </span>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      {/* ── the well ── */}
      <div className="relative min-h-[55dvh] flex-1 lg:min-h-0">
        <div ref={wrapRef} className="absolute inset-0">
          <canvas ref={canvasRef} className="size-full" aria-hidden />
        </div>

        {hosted ? (
          <CenterNotice
            title="The well runs on your machine"
            body="This hosted preview has no local store to stream. Run the dashboard locally and every agent read and write appears here, live."
          />
        ) : (
          events.length === 0 && (
            <CenterNotice
              title="Listening for agent activity"
              body={
                <>
                  Remember something from any connected agent — or run{" "}
                  <code className="rounded bg-silt/60 px-1.5 py-0.5 font-mono text-[0.72rem] text-candle">
                    norn remember &quot;…&quot;
                  </code>{" "}
                  — and watch it arrive.
                </>
              }
            />
          )
        )}

        {/* ── feed: the last few real events, newest first ── */}
        {feed.length > 0 && (
          <aside
            aria-label="Recent activity"
            className="absolute bottom-4 left-4 right-4 mx-auto max-w-md rounded-lg border border-silt bg-tide/75 backdrop-blur-md sm:left-auto sm:right-5 sm:mx-0 sm:w-[24rem]"
          >
            <p className="border-b border-silt/60 px-4 py-2 font-mono text-[0.62rem] uppercase tracking-[0.16em] text-fathom">
              Activity
            </p>
            <ul className="max-h-[17rem] divide-y divide-silt/40 overflow-hidden px-1 py-1">
              {feed.map((e) => (
                <FeedRow key={e.id} event={e} />
              ))}
            </ul>
          </aside>
        )}
      </div>

      {/* ── side panel: who's here, and who's waiting on you ── */}
      <aside
        aria-label="Agents"
        className="flex shrink-0 flex-col border-t border-silt bg-well/70 lg:w-[19.5rem] lg:overflow-y-auto lg:border-l lg:border-t-0"
      >
        {needsYou.length > 0 && <NeedsYouPanel items={needsYou} />}
        <AgentsPanel agents={agentList} hosted={hosted} />
      </aside>
      </div>
    </div>
  );
}

// ── chrome pieces ─────────────────────────────────────────────────────────────

/** Honest connection copy: polling is still live, just not push. */
const TRANSPORT_LABEL: Record<Transport, string> = {
  sse: "live",
  polling: "live · polling",
  connecting: "reconnecting",
};

/** One agent's open contradictions, for the "needs you" panel. */
interface OpenConflict {
  key: string;
  agentId: string | null;
  /** The agent's most recent still-open finding. */
  event: LiveAgentEvent;
  /** How many of its findings in the window are still unresolved. */
  open: number;
}

function HeaderStat({
  label,
  value,
  accent,
  warn,
}: {
  label: string;
  value: number;
  accent?: boolean;
  warn?: boolean;
}) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span
        className={cn(
          "text-[1rem] font-semibold leading-none tabular-nums",
          warn ? "text-destructive" : accent ? "text-candle" : "text-mist",
        )}
      >
        {value}
      </span>
      <span className="font-mono text-[0.62rem] uppercase tracking-[0.14em] text-fathom">
        {label}
      </span>
    </span>
  );
}

const KIND_META: Record<string, { label: string; dot: string }> = {
  remember: { label: "remembered", dot: SEAGLASS },
  recall: { label: "recalled", dot: CANDLE },
  forget: { label: "forgot", dot: EMBER },
  "conflict.detected": { label: "conflict", dot: ROSEWOOD },
};

function previewOf(e: AgentEvent): string {
  const d = e.detail ?? {};
  const text = d.preview ?? d.query ?? d.incomingPreview;
  return typeof text === "string" ? text : (e.memoryId ?? "");
}

function FeedRow({ event }: { event: AgentEvent }) {
  const meta = KIND_META[event.kind] ?? { label: event.kind, dot: FATHOM };
  const agent = event.agentId ?? "unknown";
  return (
    <li className="flex items-start gap-2.5 px-3 py-2">
      <span
        aria-hidden
        className="mt-1.5 size-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: meta.dot }}
      />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-x-1.5 font-mono text-[0.68rem]">
          <span style={{ color: agentColor(colorKeyOf(event)) }}>{agent}</span>
          <span className="text-fathom">{meta.label}</span>
          {event.project && <span className="text-mist/50">[{event.project}]</span>}
        </p>
        <p className="truncate text-[0.78rem] leading-snug text-mist/85">{previewOf(event)}</p>
      </div>
      <span className="shrink-0 pt-0.5 font-mono text-[0.62rem] text-fathom/80">
        {formatRelative(event.ts)}
      </span>
    </li>
  );
}

// ── side panel ────────────────────────────────────────────────────────────────

/**
 * Only agents waiting on a human decision: each row is a contradiction the
 * store flagged that nobody has resolved yet. Resolving it in the dashboard
 * removes the row on the next flags poll.
 */
function NeedsYouPanel({ items }: { items: OpenConflict[] }) {
  return (
    <section aria-label="Needs you" className="border-b border-silt">
      <h2 className="flex items-center gap-2 px-4 pb-1.5 pt-4 font-mono text-[0.62rem] uppercase tracking-[0.16em] text-destructive">
        <span aria-hidden className="size-1.5 rounded-full" style={{ backgroundColor: ROSEWOOD }} />
        Needs you
      </h2>
      <ul className="divide-y divide-silt/40 px-1 pb-2">
        {items.map((c) => {
          const preview = c.event.detail?.incomingPreview;
          return (
            <li key={c.key} className="px-3 py-2.5">
              <p className="flex flex-wrap items-baseline gap-x-1.5 font-mono text-[0.7rem]">
                <span style={{ color: agentColor(colorKeyOf(c.event)) }}>
                  {c.agentId ?? "unknown"}
                </span>
                <span className="text-fathom">
                  wrote {c.open === 1 ? "a memory" : `${c.open} memories`} that may contradict
                  what you have
                </span>
              </p>
              {typeof preview === "string" && preview && (
                <p className="mt-1 truncate text-[0.76rem] leading-snug text-mist/80">
                  &ldquo;{preview}&rdquo;
                </p>
              )}
              <Link
                href="/app"
                className="mt-1.5 inline-flex items-center gap-1 rounded font-mono text-[0.66rem] text-candle outline-none transition-colors hover:text-filament focus-visible:ring-2 focus-visible:ring-candle/30"
              >
                Review in the dashboard
                <span aria-hidden>→</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Every agent seen in the current window, newest activity first. */
function AgentsPanel({ agents, hosted }: { agents: AgentActivity[]; hosted: boolean }) {
  return (
    <section aria-label="Active agents" className="min-h-0 flex-1">
      <h2 className="px-4 pb-1.5 pt-4 font-mono text-[0.62rem] uppercase tracking-[0.16em] text-fathom">
        Agents
      </h2>
      {agents.length === 0 ? (
        <p className="px-4 pb-5 text-[0.8rem] leading-relaxed text-fathom">
          {hosted
            ? "Agents appear here when the dashboard runs next to your local store."
            : "No agents yet. The first remember, recall, or forget puts its agent on this list."}
        </p>
      ) : (
        <ul className="divide-y divide-silt/40 px-1 pb-3">
          {agents.map((a) => (
            <AgentRow key={a.agentId ?? "unknown"} agent={a} />
          ))}
        </ul>
      )}
    </section>
  );
}

function AgentRow({ agent }: { agent: AgentActivity }) {
  const meta = KIND_META[agent.lastKind] ?? { label: agent.lastKind, dot: FATHOM };
  const color = agentColor(colorKeyOf(agent.last));
  const glyph = glyphForModel(agent.model);
  return (
    <li className="px-3 py-2.5">
      <p className="flex items-center gap-2.5 font-mono text-[0.72rem]">
        {/* Creature sprite; the model's mark rides as a badge when reported. */}
        <span aria-hidden className="relative size-5 shrink-0">
          <span
            className="absolute inset-0 rounded-full opacity-20"
            style={{ backgroundColor: color }}
          />
          <span
            className="absolute left-1/2 top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ backgroundColor: color }}
          />
          {glyph && (
            <span
              className="absolute -bottom-1 -right-1 grid size-3.5 place-items-center rounded border border-silt bg-well"
              style={{ color }}
            >
              <ModelGlyphIcon glyph={glyph} className="size-2.5" />
            </span>
          )}
        </span>
        <span className="min-w-0 truncate" style={{ color }}>
          {agent.agentId ?? "unknown"}
        </span>
        <span className="ml-auto shrink-0 text-[0.62rem] tabular-nums text-fathom/80">
          {agent.events} {agent.events === 1 ? "event" : "events"}
        </span>
      </p>
      <p className="mt-1 flex flex-wrap items-baseline gap-x-1.5 pl-[1.9rem] font-mono text-[0.66rem] text-fathom">
        <span className="text-mist/70">{agent.model ?? "model unreported"}</span>
        <span aria-hidden>·</span>
        <span style={{ color: meta.dot }}>{meta.label}</span>
        <span>{formatRelative(agent.lastSeen)}</span>
      </p>
    </li>
  );
}

function CenterNotice({ title, body }: { title: string; body: React.ReactNode }) {
  return (
    <div className="pointer-events-none absolute inset-0 grid place-items-center px-6">
      <div className="pointer-events-auto max-w-sm translate-y-24 text-center">
        <h1 className="font-display text-[1.35rem] text-mist">{title}</h1>
        <p className="mt-2 text-[0.85rem] leading-relaxed text-fathom">{body}</p>
      </div>
    </div>
  );
}
