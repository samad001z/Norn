"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import {
  motion,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";
import { cn } from "@/lib/utils";
import { SmoothScroll } from "@/components/landing/smooth-scroll";
import { RAIL_X, Row } from "@/components/landing/primitives";

// Below-the-fold work is code-split: the hero ships light, the rest of the
// thread + reveals load as their own chunk (still SSR'd for first paint + SEO).
const BelowFold = dynamic(() =>
  import("@/components/landing/below-fold").then((m) => m.BelowFold),
);

const FRAGMENTS = [
  { t: "prefers tabs", c: "left-[2%] top-[8%] -rotate-6", dx: -24, dy: 44, mobile: true },
  { t: "deploy = main", c: "right-[4%] top-[14%] rotate-3", dx: -130, dy: 60, mobile: true },
  { t: "pnpm, not npm", c: "right-[16%] top-[34%] -rotate-2", dx: -150, dy: 40, mobile: false },
  { t: "api base = /v2", c: "left-[6%] top-[42%] rotate-2", dx: -30, dy: 30, mobile: false },
  { t: "use the new auth flow", c: "right-[2%] top-[54%] -rotate-3", dx: -170, dy: 22, mobile: false },
  { t: "no force-push to main", c: "left-[3%] top-[66%] rotate-1", dx: -24, dy: 12, mobile: false },
];

function Fragment({
  progress,
  frag,
}: {
  progress: MotionValue<number>;
  frag: (typeof FRAGMENTS)[number];
}) {
  const reduce = useReducedMotion();
  const opacity = useTransform(progress, [0, 0.5], [0.5, 0]);
  const x = useTransform(progress, [0, 1], [0, frag.dx]);
  const y = useTransform(progress, [0, 1], [0, frag.dy]);

  return (
    <motion.span
      aria-hidden
      style={reduce ? { opacity: 0.32 } : { opacity, x, y }}
      className={cn(
        "absolute font-mono text-xs text-fathom/50 sm:text-sm",
        frag.c,
        frag.mobile ? "block" : "hidden sm:block",
      )}
    >
      {frag.t}
    </motion.span>
  );
}

function Fragments({ progress }: { progress: MotionValue<number> }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 select-none">
      {FRAGMENTS.map((f) => (
        <Fragment key={f.t} progress={progress} frag={f} />
      ))}
    </div>
  );
}

export function Landing() {
  const reduce = useReducedMotion();
  const mainRef = React.useRef<HTMLElement>(null);
  const heroRef = React.useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({
    target: mainRef,
    offset: ["start start", "end end"],
  });
  // spring-smoothed scrub so the thread draws silkily, still scroll-linked
  const litScale = useSpring(scrollYProgress, {
    stiffness: 90,
    damping: 30,
    mass: 0.3,
  });
  const { scrollYProgress: heroProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });

  return (
    <SmoothScroll>
      <div className="min-h-[100dvh]">
        <header className="sticky top-0 z-40 border-b border-silt/60 bg-well/80 backdrop-blur">
          <nav className="mx-auto flex h-16 max-w-4xl items-center justify-between px-6">
            <span className="font-display text-lg text-mist">Norn</span>
            <div className="flex items-center gap-5 text-sm">
              <a href="#how" className="hidden text-fathom transition-colors hover:text-mist sm:inline">
                How it works
              </a>
              <a href="https://github.com/samad001z/Norn"
                target="_blank"
                rel="noreferrer" className="text-fathom transition-colors hover:text-mist">
                GitHub
              </a>
              <a
                href="#early-access"
                className="rounded-lg bg-candle px-3.5 py-2 font-medium text-well transition-colors hover:bg-ember"
              >
                Give your AI memory
              </a>
            </div>
          </nav>
        </header>

        <main ref={mainRef} className="relative mx-auto max-w-4xl px-6">
          {/* dim track */}
          <div
            aria-hidden
            className={cn(
              "pointer-events-none absolute inset-y-0 -z-10 w-px -translate-x-1/2 bg-candle/12",
              RAIL_X,
            )}
          />
          {/* lit thread, drawn by scroll */}
          <motion.div
            aria-hidden
            style={{ scaleY: reduce ? 1 : litScale }}
            className={cn(
              "pointer-events-none absolute inset-y-0 -z-10 w-px -translate-x-1/2 origin-top bg-gradient-to-b from-filament via-candle to-candle/80 shadow-[0_0_10px_1px_rgba(233,184,122,0.4)]",
              RAIL_X,
            )}
          />

          {/* HERO */}
          <section>
            <Row marker="anchor" markerTop="top-[36%]">
              <div
                ref={heroRef}
                className="relative flex min-h-[calc(100dvh-4rem)] flex-col justify-center py-20"
              >
                <Fragments progress={heroProgress} />
                <h1 className="relative max-w-[18ch] text-balance font-display text-[clamp(2.5rem,6vw,4.75rem)] leading-[1.08] tracking-[-0.02em]">
                  <span className="text-mist/55">Your AI forgets you every session.</span>{" "}
                  <span className="italic text-mist">Norn remembers.</span>
                </h1>
                <p className="relative mt-6 max-w-[46ch] text-lg leading-relaxed text-fathom">
                  Persistent, visible memory for Claude Code and Cursor. It keeps your
                  decisions and project context across every session.
                </p>
                <div className="relative mt-9 flex flex-col gap-4 sm:flex-row sm:items-center">
                  <a
                    href="#early-access"
                    className="grid h-12 place-items-center rounded-lg bg-candle px-6 font-medium text-well transition-colors outline-none hover:bg-ember focus-visible:ring-2 focus-visible:ring-candle/60 sm:inline-flex"
                  >
                    Give your AI memory
                  </a>
                  <a
                    href="#how"
                    className="grid h-12 place-items-center rounded-lg px-2 text-mist underline-offset-4 transition-colors outline-none hover:text-candle focus-visible:ring-2 focus-visible:ring-candle/50 sm:inline-flex"
                  >
                    See how it works →
                  </a>
                </div>
              </div>
            </Row>
          </section>

          <BelowFold />
        </main>

        <footer className="border-t border-silt">
          <div className="mx-auto flex max-w-4xl flex-col items-start justify-between gap-3 px-6 py-8 font-mono text-xs text-fathom sm:flex-row sm:items-center">
            <span>Norn · local-first memory</span>
            <div className="flex gap-5">
              <a href="#how" className="transition-colors hover:text-mist">How it works</a>
              <a href="https://github.com/samad001z/Norn"
                target="_blank"
                rel="noreferrer" className="transition-colors hover:text-mist">GitHub</a>
            </div>
          </div>
        </footer>
      </div>
    </SmoothScroll>
  );
}
