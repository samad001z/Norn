"use client";

import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

/** Center of the w-10 / w-12 rail, shared by the thread lines and the beads. */
export const RAIL_X = "left-[2.75rem] sm:left-[3rem]";

/** Ease-out quint. No bounce, no elastic (per motion guidance). */
export const EASE_OUT = [0.22, 1, 0.36, 1] as const;

export type Marker = "anchor" | "bead" | "knot";

const MARKER: Record<Marker, string> = {
  bead: "size-2.5 bg-filament shadow-[0_0_10px_2px_rgba(233,184,122,0.45)]",
  anchor:
    "size-3 bg-filament shadow-[0_0_14px_3px_rgba(233,184,122,0.5)] ring-2 ring-candle/30",
  knot: "size-4 bg-filament shadow-[0_0_18px_5px_rgba(233,184,122,0.55)] ring-2 ring-candle/40",
};

/**
 * A bead on the thread. Ignites once as it enters view via IntersectionObserver
 * (whileInView) — cheaper than continuous scroll math, and a one-shot ignite
 * reads as "the thread gains a bead." Reduced motion renders it already lit.
 */
function Bead({ marker, markerTop = "top-7" }: { marker: Marker; markerTop?: string }) {
  const reduce = useReducedMotion();
  return (
    <span aria-hidden className={cn("absolute left-1/2 -translate-x-1/2", markerTop)}>
      <motion.span
        initial={reduce ? false : { opacity: 0.18, scale: 0.45 }}
        whileInView={reduce ? undefined : { opacity: 1, scale: 1 }}
        viewport={{ once: true, amount: 1 }}
        transition={{ duration: 0.5, ease: EASE_OUT }}
        className={cn("block rounded-full", MARKER[marker])}
      />
    </span>
  );
}

export function Rail({ marker, markerTop }: { marker?: Marker; markerTop?: string }) {
  return (
    <div aria-hidden className="relative w-10 shrink-0 sm:w-12">
      {marker && <Bead marker={marker} markerTop={markerTop} />}
    </div>
  );
}

export function Row({
  marker,
  markerTop,
  className,
  children,
}: {
  marker?: Marker;
  markerTop?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex gap-5 sm:gap-8", className)}>
      <Rail marker={marker} markerTop={markerTop} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** Reveal-on-scroll. Enhances an already-visible default; static under reduced motion. */
export function Reveal({
  children,
  y = 16,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  y?: number;
  delay?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y }}
      whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.6, delay, ease: EASE_OUT }}
    >
      {children}
    </motion.div>
  );
}
