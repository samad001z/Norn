"use client";

import * as React from "react";
import {
  motion,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "motion/react";
import {
  ArrowRight,
  Blocks,
  Check,
  Code2,
  Copy,
  Eye,
  GitBranch,
  GitCompare,
  Github,
  HardDrive,
  Hourglass,
  Infinity as InfinityIcon,
  MousePointer2,
  Scale,
  Search,
  SquareTerminal,
  Star,
  Wind,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { Reveal, EASE_OUT } from "@/components/landing/primitives";
import { cn } from "@/lib/utils";

/*
  Norn — landing page. Dark, technical, premium "developer infrastructure."
  One warm candlelight gold accent in a near-black room. No blue. No invented
  metrics, sync, or encryption claims — only the real, shipped feature set.

  The one-line MCP install for Claude Code, against the published package
  (@samad001z/norn-server). The same command appears in the hero terminal and the
  final call-to-action.
*/
const INSTALL_CMD = "claude mcp add norn -- npx -y @samad001z/norn-server";
const GITHUB_URL = "https://github.com/samad001z/Norn";

// ---------------------------------------------------------------------------
// Brand marks
// ---------------------------------------------------------------------------

/** Small neural-node mark: four nodes on a filament, one lit brighter. */
function NodeMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={className}>
      <path
        d="M5 4.5 L12 9 L8 14.5 L17 19.5"
        stroke="currentColor"
        strokeOpacity="0.4"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="5" cy="4.5" r="1.6" fill="currentColor" fillOpacity="0.55" />
      <circle cx="12" cy="9" r="2.1" fill="currentColor" />
      <circle cx="8" cy="14.5" r="1.6" fill="currentColor" fillOpacity="0.55" />
      <circle cx="17" cy="19.5" r="1.8" fill="currentColor" fillOpacity="0.8" />
    </svg>
  );
}

function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <NodeMark className="size-5 text-candle drop-shadow-[0_0_10px_rgba(233,184,122,0.45)]" />
      <span className="font-mono text-[0.95rem] font-medium uppercase tracking-[0.28em] text-mist">
        Norn
      </span>
    </span>
  );
}

/** Mono uppercase section eyebrow. */
function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 font-mono text-[0.7rem] uppercase tracking-[0.24em] text-ember">
      <span aria-hidden className="h-px w-6 bg-ember/50" />
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

function GoldButton({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <a
      href={href}
      className={cn(
        "group inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-candle px-5 text-[0.875rem] font-semibold text-well shadow-[0_0_28px_-8px_rgba(233,184,122,0.8)] outline-none transition-all hover:bg-filament hover:shadow-[0_0_34px_-6px_rgba(246,220,171,0.85)] focus-visible:ring-2 focus-visible:ring-candle/60",
        className,
      )}
    >
      {children}
    </a>
  );
}

function GhostButton({
  href,
  children,
  external,
  className,
}: {
  href: string;
  children: React.ReactNode;
  external?: boolean;
  className?: string;
}) {
  return (
    <a
      href={href}
      {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
      className={cn(
        "inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-silt bg-white/[0.02] px-5 text-[0.875rem] font-medium text-mist outline-none transition-colors hover:border-fathom/50 hover:bg-white/[0.05] focus-visible:ring-2 focus-visible:ring-candle/40",
        className,
      )}
    >
      {children}
    </a>
  );
}

// ---------------------------------------------------------------------------
// The continuous "memory thread" — a gold filament that draws as you scroll
// ---------------------------------------------------------------------------

function MemoryThread() {
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const draw = useSpring(scrollYProgress, { stiffness: 80, damping: 26, restDelta: 0.001 });
  const headTop = useTransform(draw, (v) => `${v * 100}%`);

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-0 hidden justify-center sm:flex">
      <div className="relative h-full w-px">
        {/* unlit track */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-silt to-transparent" />
        {/* the filament, drawn from the top */}
        <motion.div
          style={{ scaleY: reduce ? 1 : draw }}
          className="absolute inset-0 origin-top bg-gradient-to-b from-candle/0 via-candle/70 to-candle shadow-[0_0_12px_0_rgba(233,184,122,0.5)]"
        />
        {/* the glowing draw-head */}
        {!reduce && (
          <motion.span
            style={{ top: headTop }}
            className="absolute left-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-filament shadow-[0_0_14px_4px_rgba(246,220,171,0.6)]"
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-silt/70 bg-well/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <a href="#top" className="outline-none focus-visible:ring-2 focus-visible:ring-candle/40">
          <Wordmark />
        </a>
        <nav className="hidden items-center gap-8 font-mono text-[0.78rem] text-fathom md:flex">
          <a href="#features" className="transition-colors hover:text-mist">Features</a>
          <a href="#how" className="transition-colors hover:text-mist">How it works</a>
          <a href="#whatsnew" className="transition-colors hover:text-mist">v1.2</a>
        </nav>
        <div className="flex items-center gap-3">
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            aria-label="GitHub"
            className="text-fathom outline-none transition-colors hover:text-mist focus-visible:ring-2 focus-visible:ring-candle/40"
          >
            <Github className="size-[1.1rem]" />
          </a>
          <a
            href="/app"
            className="rounded-md border border-silt bg-white/[0.02] px-3.5 py-1.5 text-[0.8rem] font-medium text-mist transition-colors hover:border-fathom/50 hover:bg-white/[0.05]"
          >
            Open Dashboard
          </a>
        </div>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

function useTypewriter(text: string, speed = 34) {
  const reduce = useReducedMotion();
  const [out, setOut] = React.useState(reduce ? text : "");
  React.useEffect(() => {
    if (reduce) {
      setOut(text);
      return;
    }
    setOut("");
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setOut(text.slice(0, i));
      if (i >= text.length) clearInterval(id);
    }, speed);
    return () => clearInterval(id);
  }, [text, speed, reduce]);
  return out;
}

function TerminalCard() {
  const reduce = useReducedMotion();
  const typed = useTypewriter(INSTALL_CMD);
  const done = typed.length === INSTALL_CMD.length;
  // Reveal the recall example once the command finishes typing.
  const exampleDelay = reduce ? 0 : (INSTALL_CMD.length * 34) / 1000 + 0.25;

  return (
    <div className="overflow-hidden rounded-xl border border-silt bg-[#0c1016] shadow-[0_40px_120px_-40px_rgba(0,0,0,0.9)]">
      <div className="flex items-center gap-1.5 border-b border-silt/80 px-4 py-3">
        <span className="size-2.5 rounded-full bg-silt" />
        <span className="size-2.5 rounded-full bg-silt" />
        <span className="size-2.5 rounded-full bg-silt" />
        <span className="ml-2 font-mono text-[0.7rem] text-fathom">norn — setup</span>
      </div>
      <div className="space-y-4 p-5 font-mono text-[0.78rem] leading-relaxed">
        <div>
          <p className="text-fathom"># 1 · give your agent memory</p>
          <p className="text-mist">
            <span className="text-candle">$ </span>
            <span className="break-all">{typed}</span>
            {!done && !reduce && (
              <span className="ml-px inline-block h-[1.05em] w-[0.5ch] translate-y-[0.15em] bg-candle align-middle animate-norn-blink" />
            )}
          </p>
        </div>

        <motion.div
          initial={reduce ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: exampleDelay, ease: EASE_OUT }}
          className="space-y-1.5 border-t border-silt/60 pt-4"
        >
          <p className="text-fathom"># 2 · it just remembers — across sessions</p>
          <p className="text-mist">
            <span className="text-filament">remember</span>
            <span className="text-fathom">(</span>
            <span className="text-candle">&quot;Deploy to prod from main on Vercel&quot;</span>
            <span className="text-fathom">)</span>
          </p>
          <p className="text-mist">
            <span className="text-filament">recall</span>
            <span className="text-fathom">(</span>
            <span className="text-candle">&quot;how do we ship?&quot;</span>
            <span className="text-fathom">)</span>
          </p>
          <p className="pl-3 text-fathom">→ &quot;Deploy to prod from main on Vercel&quot;</p>
        </motion.div>
      </div>
    </div>
  );
}

function Hero() {
  const reduce = useReducedMotion();
  return (
    <section id="top" className="relative overflow-hidden">
      {/* soft radial gold glow, gently pulsing */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute left-1/2 top-[-6rem] -z-0 h-[640px] w-[900px] max-w-[120vw] -translate-x-1/2 rounded-full",
          "bg-[radial-gradient(45%_50%_at_50%_45%,rgba(233,184,122,0.16),rgba(201,146,78,0.06)_45%,transparent_72%)]",
          !reduce && "animate-norn-pulse",
        )}
      />

      <div className="mx-auto grid max-w-6xl items-center gap-14 px-5 pb-24 pt-20 lg:grid-cols-[1.05fr_0.95fr] lg:pt-28">
        <Reveal className="relative z-10">
          <span className="inline-flex items-center gap-2 rounded-full border border-silt bg-white/[0.02] px-3 py-1 font-mono text-[0.65rem] uppercase tracking-[0.2em] text-fathom">
            <span className="size-1.5 rounded-full bg-candle shadow-[0_0_8px_2px_rgba(233,184,122,0.6)]" />
            v1.2 · Open Source
          </span>

          <h1 className="mt-6 text-[clamp(2.75rem,6.5vw,4.75rem)] font-semibold leading-[0.98] tracking-[-0.035em] text-mist">
            Memory your AI{" "}
            <span className="font-display font-normal italic text-candle">keeps</span>
          </h1>

          <p className="mt-6 max-w-xl text-[1.0625rem] leading-relaxed text-fathom">
            Local-first, persistent, per-project memory for your AI coding agents.
            Fully local. Fully yours.
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <GoldButton href="/app">
              Get Started
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </GoldButton>
            <GhostButton href={GITHUB_URL} external>
              <Github className="size-4" />
              View on GitHub
            </GhostButton>
          </div>

          <p className="mt-7 font-mono text-[0.72rem] text-fathom/80">
            Claude Code · Cursor · any MCP editor
          </p>
        </Reveal>

        <Reveal delay={0.15} y={24} className="relative z-10">
          <TerminalCard />
        </Reveal>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Works with — MCP-client marquee
// ---------------------------------------------------------------------------

// Minimal monochrome marks for the three named brands; the rest reuse lucide.
function ClaudeMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className}>
      <g stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        {[0, 45, 90, 135].map((a) => {
          const r = (a * Math.PI) / 180;
          return (
            <line
              key={a}
              x1={12 - 7 * Math.cos(r)}
              y1={12 - 7 * Math.sin(r)}
              x2={12 + 7 * Math.cos(r)}
              y2={12 + 7 * Math.sin(r)}
            />
          );
        })}
      </g>
    </svg>
  );
}
function OpenAIMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={className}>
      <polygon points="12,3 19.5,7.5 19.5,16.5 12,21 4.5,16.5 4.5,7.5" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="2" fill="currentColor" />
    </svg>
  );
}
function GeminiMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className}>
      <path
        d="M12 2 C12.6 7.8 16.2 11.4 22 12 C16.2 12.6 12.6 16.2 12 22 C11.4 16.2 7.8 12.6 2 12 C7.8 11.4 11.4 7.8 12 2 Z"
        fill="currentColor"
      />
    </svg>
  );
}

type Mark = React.ComponentType<{ className?: string }>;
const TOOLS: Array<{ name: string; mark: Mark }> = [
  { name: "Claude", mark: ClaudeMark },
  { name: "ChatGPT", mark: OpenAIMark },
  { name: "Gemini", mark: GeminiMark },
  { name: "Cursor", mark: (p) => <MousePointer2 {...p} /> },
  { name: "Windsurf", mark: (p) => <Wind {...p} /> },
  { name: "Cline", mark: (p) => <SquareTerminal {...p} /> },
  { name: "Zed", mark: (p) => <Zap {...p} /> },
  { name: "VS Code", mark: (p) => <Code2 {...p} /> },
  { name: "Continue", mark: (p) => <InfinityIcon {...p} /> },
];

function ToolTile({ name, mark: Mark }: { name: string; mark: Mark }) {
  return (
    <div className="flex shrink-0 items-center gap-2.5 rounded-lg border border-silt bg-tide/50 px-4 py-2.5 transition-colors hover:border-candle/30">
      <Mark className="size-[1.05rem] text-mist/70" />
      <span className="whitespace-nowrap font-mono text-[0.8rem] text-mist">{name}</span>
    </div>
  );
}

function WorksWith() {
  return (
    <section className="relative z-10 border-y border-silt/60 bg-[#080b10] py-9">
      <div className="mx-auto mb-6 max-w-3xl px-5 text-center">
        <span className="font-mono text-[0.68rem] uppercase tracking-[0.24em] text-ember">
          Works with any MCP client
        </span>
        <p className="mx-auto mt-3 max-w-xl text-[0.9rem] leading-relaxed text-fathom">
          Norn is an MCP server over stdio, so it plugs into any MCP-compatible editor or
          agent — no per-tool adapter. A few of them:
        </p>
      </div>
      <div className="group relative overflow-hidden [mask-image:linear-gradient(to_right,transparent,#000_9%,#000_91%,transparent)]">
        <div className="flex w-max animate-norn-marquee gap-3 px-1.5 group-hover:[animation-play-state:paused]">
          {[...TOOLS, ...TOOLS].map((t, i) => (
            <ToolTile key={`${t.name}-${i}`} {...t} />
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Features
// ---------------------------------------------------------------------------

const FEATURES: Array<{ icon: LucideIcon; title: string; body: string }> = [
  {
    icon: HardDrive,
    title: "100% local",
    body: "Runs entirely on your machine, embedding model included. No API key, no cloud, no telemetry.",
  },
  {
    icon: GitBranch,
    title: "Per-project, committable",
    body: "Each project gets its own isolated memory — export it to a diffable file and commit it with your repo.",
  },
  {
    icon: Eye,
    title: "Total control",
    body: "A dashboard to see, search, and forget every memory. Nothing hidden.",
  },
  {
    icon: Search,
    title: "Semantic recall",
    body: "Finds memories by meaning, not keywords.",
  },
  {
    icon: Hourglass,
    title: "Staleness surfacing",
    body: "Quietly flags memories you haven't touched in a while, so you can prune.",
  },
  {
    icon: GitCompare,
    title: "Possible-conflict detection",
    body: "Flags memories that might disagree and lets you choose — never auto-changes anything.",
  },
  {
    icon: Blocks,
    title: "Works with your tools",
    body: "Claude Code, Cursor, and any MCP-compatible editor.",
  },
  {
    icon: Scale,
    title: "Open source",
    body: "MIT licensed. No lock-in.",
  },
];

function FeatureCard({ icon: Icon, title, body }: (typeof FEATURES)[number]) {
  return (
    <div className="group relative flex h-full flex-col rounded-xl border border-silt bg-tide/70 p-5 transition-all duration-300 hover:-translate-y-1 hover:border-candle/30 hover:shadow-[0_0_34px_-12px_rgba(233,184,122,0.35)]">
      <span className="mb-4 grid size-9 place-items-center rounded-lg border border-silt bg-well/60 text-candle transition-colors group-hover:border-candle/40 group-hover:text-filament">
        <Icon className="size-4" />
      </span>
      <h3 className="text-[0.95rem] font-semibold text-mist">{title}</h3>
      <p className="mt-2 text-[0.84rem] leading-relaxed text-fathom">{body}</p>
    </div>
  );
}

function FeaturesSection() {
  return (
    <section id="features" className="relative z-10 mx-auto max-w-6xl px-5 py-24">
      <Reveal className="max-w-2xl">
        <Eyebrow>Built for developers</Eyebrow>
        <h2 className="mt-4 text-[clamp(1.9rem,4vw,2.6rem)] font-semibold tracking-tight text-mist">
          Everything it does, and nothing it doesn&apos;t
        </h2>
        <p className="mt-4 max-w-lg text-[0.95rem] leading-relaxed text-fathom">
          A memory layer that earns trust by being legible. Eight honest capabilities —
          no magic, no lock-in.
        </p>
      </Reveal>

      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map((f, i) => (
          <Reveal key={f.title} delay={(i % 4) * 0.06} className="h-full">
            <FeatureCard {...f} />
          </Reveal>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// How it works
// ---------------------------------------------------------------------------

const STEPS = [
  {
    n: "01",
    title: "A local store",
    body: "SQLite plus a local embedding model, running on your machine. Your memory never leaves it.",
  },
  {
    n: "02",
    title: "Per-project isolation",
    body: "Memory is scoped to each project and committed alongside the repo — portable, reviewable, yours.",
  },
  {
    n: "03",
    title: "You stay in control",
    body: "Inspect, edit by forgetting, export and import. Every memory is visible and reversible.",
  },
];

/** A calm "memory thread" of connected nodes — not a fake dashboard. */
function ThreadVisual() {
  const reduce = useReducedMotion();
  const nodes = [
    { cx: 70, cy: 40, r: 6 },
    { cx: 110, cy: 110, r: 4.5 },
    { cx: 55, cy: 175, r: 5 },
    { cx: 120, cy: 240, r: 7 },
    { cx: 60, cy: 305, r: 4.5 },
    { cx: 100, cy: 360, r: 6 },
  ];
  return (
    <svg viewBox="0 0 180 400" className="h-full w-full max-w-[16rem]" aria-hidden>
      <defs>
        <linearGradient id="thread" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e9b87a" stopOpacity="0.15" />
          <stop offset="50%" stopColor="#e9b87a" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#e9b87a" stopOpacity="0.15" />
        </linearGradient>
      </defs>
      <motion.path
        d="M70 40 L110 110 L55 175 L120 240 L60 305 L100 360"
        fill="none"
        stroke="url(#thread)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={reduce ? false : { pathLength: 0, opacity: 0.4 }}
        whileInView={reduce ? undefined : { pathLength: 1, opacity: 1 }}
        viewport={{ once: true, amount: 0.4 }}
        transition={{ duration: 1.6, ease: EASE_OUT }}
      />
      {nodes.map((nd, i) => (
        <motion.circle
          key={i}
          cx={nd.cx}
          cy={nd.cy}
          r={nd.r}
          fill="#e9b87a"
          initial={reduce ? false : { opacity: 0.2, scale: 0.5 }}
          whileInView={reduce ? undefined : { opacity: 1, scale: 1 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.5, delay: 0.2 + i * 0.18, ease: EASE_OUT }}
          style={{ filter: "drop-shadow(0 0 6px rgba(233,184,122,0.55))", transformOrigin: `${nd.cx}px ${nd.cy}px` }}
        />
      ))}
    </svg>
  );
}

function HowItWorks() {
  return (
    <section id="how" className="relative z-10 border-y border-silt/60 bg-[#080b10]">
      <div className="mx-auto grid max-w-6xl items-center gap-14 px-5 py-24 md:grid-cols-[1.1fr_0.9fr]">
        <div>
          <Reveal>
            <Eyebrow>How it works</Eyebrow>
            <h2 className="mt-4 text-[clamp(1.9rem,4vw,2.6rem)] font-semibold tracking-tight text-mist">
              Simple parts, fully in the open
            </h2>
          </Reveal>
          <div className="mt-10 space-y-9">
            {STEPS.map((s, i) => (
              <Reveal key={s.n} delay={i * 0.08}>
                <div className="flex gap-5">
                  <span className="font-mono text-[0.85rem] text-candle">{s.n}</span>
                  <div>
                    <h3 className="text-[1rem] font-semibold text-mist">{s.title}</h3>
                    <p className="mt-1.5 max-w-md text-[0.9rem] leading-relaxed text-fathom">
                      {s.body}
                    </p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>

        <Reveal delay={0.1} className="flex justify-center">
          <div className="relative grid h-[380px] w-full place-items-center">
            <div
              aria-hidden
              className="absolute size-48 rounded-full bg-[radial-gradient(circle,rgba(233,184,122,0.14),transparent_70%)] blur-2xl"
            />
            <ThreadVisual />
          </div>
        </Reveal>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// What's new in v1.2
// ---------------------------------------------------------------------------

function WhatsNew() {
  const items = [
    {
      icon: Hourglass,
      title: "Staleness surfacing",
      body: "Memories you haven't touched in a while are quietly flagged for review.",
    },
    {
      icon: GitCompare,
      title: "Possible-conflict detection",
      body: "When two memories might disagree, Norn shows you both and lets you decide.",
    },
  ];
  return (
    <section id="whatsnew" className="relative z-10 mx-auto max-w-6xl px-5 py-24">
      <Reveal className="overflow-hidden rounded-2xl border border-candle/20 bg-[radial-gradient(120%_140%_at_0%_0%,rgba(233,184,122,0.08),transparent_55%)] p-8 sm:p-10">
        <div className="flex flex-col gap-2">
          <Eyebrow>What&apos;s new · v1.2</Eyebrow>
          <h2 className="max-w-xl text-[clamp(1.6rem,3.4vw,2.25rem)] font-semibold tracking-tight text-mist">
            It surfaces and suggests. You decide.
          </h2>
        </div>

        <div className="mt-9 grid gap-4 sm:grid-cols-2">
          {items.map((it, i) => (
            <Reveal key={it.title} delay={i * 0.08}>
              <div className="flex h-full gap-4 rounded-xl border border-silt bg-tide/60 p-5">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-candle/30 bg-well/60 text-candle">
                  <it.icon className="size-4" />
                </span>
                <div>
                  <h3 className="text-[0.95rem] font-semibold text-mist">{it.title}</h3>
                  <p className="mt-1.5 text-[0.85rem] leading-relaxed text-fathom">{it.body}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
        <p className="mt-6 font-mono text-[0.72rem] text-fathom">
          Norn never auto-deletes or auto-edits. Nothing changes without your say.
        </p>
      </Reveal>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Final CTA
// ---------------------------------------------------------------------------

/** Copy-to-clipboard button with a brief "copied" check. */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <button
      type="button"
      aria-label={copied ? "Copied" : "Copy command"}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch {
          /* clipboard blocked — no-op */
        }
      }}
      className="shrink-0 rounded p-1 text-fathom outline-none transition-colors hover:text-mist focus-visible:ring-2 focus-visible:ring-candle/40"
    >
      {copied ? <Check className="size-4 text-candle" /> : <Copy className="size-4" />}
    </button>
  );
}

function FinalCta() {
  return (
    <section className="relative z-10 mx-auto max-w-3xl px-5 py-28 text-center">
      <Reveal>
        <Eyebrow>Get started</Eyebrow>
        <h2 className="mx-auto mt-4 max-w-xl text-[clamp(2rem,4.5vw,3rem)] font-semibold tracking-tight text-mist">
          Give your agent a memory it keeps
        </h2>
        <p className="mx-auto mt-4 max-w-md text-[0.95rem] leading-relaxed text-fathom">
          One command, fully local. Open the dashboard whenever you want to see
          exactly what it remembers.
        </p>

        <div className="mx-auto mt-9 flex max-w-md items-start gap-3 rounded-lg border border-silt bg-[#0c1016] px-4 py-3 text-left font-mono text-[0.8rem]">
          <span className="select-none leading-relaxed text-candle">$</span>
          <code className="min-w-0 flex-1 break-words leading-relaxed text-mist">{INSTALL_CMD}</code>
          <CopyButton text={INSTALL_CMD} />
        </div>

        <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <GoldButton href={GITHUB_URL}>
            <Star className="size-4" />
            Star on GitHub
          </GoldButton>
          <GhostButton href="/app">Open Dashboard</GhostButton>
        </div>
      </Reveal>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Footer
// ---------------------------------------------------------------------------

function Footer() {
  return (
    <footer className="relative z-10 border-t border-silt/70 bg-[#080b10]">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-5 py-12 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Wordmark />
          <p className="mt-3 max-w-xs text-[0.82rem] leading-relaxed text-fathom">
            A memory layer your AI keeps — local-first, legible, and yours.
          </p>
        </div>

        <nav className="flex flex-col gap-3 font-mono text-[0.8rem] text-fathom sm:items-end">
          <div className="flex gap-6">
            <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="transition-colors hover:text-mist">
              Docs
            </a>
            <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="transition-colors hover:text-mist">
              GitHub
            </a>
            <a
              href={`${GITHUB_URL}/blob/main/LICENSE`}
              target="_blank"
              rel="noreferrer"
              className="transition-colors hover:text-mist"
            >
              License
            </a>
          </div>
          <span className="text-[0.72rem] text-fathom/70">MIT licensed · local-first</span>
        </nav>
      </div>
    </footer>
  );
}

// ---------------------------------------------------------------------------

export function Landing() {
  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-well text-mist">
      <MemoryThread />
      <Header />
      <main className="relative">
        <Hero />
        <WorksWith />
        <FeaturesSection />
        <HowItWorks />
        <WhatsNew />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}
