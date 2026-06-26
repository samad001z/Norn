"use client";

import { motion, useReducedMotion } from "motion/react";
import type { Memory } from "@/components/memory-card";
import { Button } from "@/components/ui/button";

export interface ConflictPair {
  a: Memory;
  b: Memory;
}

export interface ConflictReviewProps {
  pairs: ConflictPair[];
  /** Keep one memory, forget the other. */
  onKeep: (keepId: string, dropId: string) => void;
  /** Keep both — dismiss the flag without deleting anything. */
  onKeepBoth: (aId: string, bId: string) => void;
}

/** One side of a pair: the memory, its context, and the button to keep it. */
function Side({ memory, onKeep }: { memory: Memory; onKeep: () => void }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-3 rounded-md border border-silt bg-well/40 p-4">
      <p className="font-display text-[0.9375rem] leading-relaxed text-mist">{memory.content}</p>
      <div className="mt-auto flex items-center justify-between gap-2 font-mono text-[0.6875rem] text-fathom">
        <span className="truncate">{memory.project ?? "global"}</span>
        <Button
          size="sm"
          variant="outline"
          onClick={onKeep}
          className="h-7 shrink-0 border-silt bg-transparent px-3 text-xs text-mist hover:bg-silt hover:text-mist"
        >
          Keep this
        </Button>
      </div>
    </div>
  );
}

/**
 * Surfaces flagged "possible conflict" pairs for the user to resolve. Honest by
 * design: these are guesses, never verdicts, and nothing is deleted unless the
 * user picks a side. Calm ember accent — two flames to reconcile, not an alarm.
 */
export function ConflictReview({ pairs, onKeep, onKeepBoth }: ConflictReviewProps) {
  const reduce = useReducedMotion();
  if (pairs.length === 0) return null;

  return (
    <section
      aria-label="Possible conflicts"
      className="mb-8 rounded-lg border border-ember/30 bg-tide/60 p-5"
    >
      <div className="mb-1 flex items-center gap-2">
        <span aria-hidden className="size-1.5 rounded-full bg-ember/80" />
        <h2 className="font-display text-[1.125rem] text-mist">
          Possible {pairs.length === 1 ? "conflict" : "conflicts"}
        </h2>
        <span className="font-mono text-xs text-fathom">{pairs.length}</span>
      </div>
      <p className="mb-5 max-w-prose text-sm leading-relaxed text-fathom">
        These look like they might disagree. It’s a guess, not a verdict — Norn won’t
        change anything until you choose. Keep one, or keep both.
      </p>

      <ul className="space-y-4">
        {pairs.map(({ a, b }) => (
          <motion.li
            key={`${a.id}|${b.id}`}
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="rounded-lg border border-silt bg-tide p-4"
          >
            <div className="flex flex-col items-stretch gap-3 sm:flex-row">
              <Side memory={a} onKeep={() => onKeep(a.id, b.id)} />
              <div
                aria-hidden
                className="flex items-center justify-center font-mono text-[0.6875rem] uppercase tracking-wider text-fathom"
              >
                or
              </div>
              <Side memory={b} onKeep={() => onKeep(b.id, a.id)} />
            </div>
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={() => onKeepBoth(a.id, b.id)}
                className="rounded px-2 py-1 font-mono text-[0.6875rem] text-fathom underline-offset-4 outline-none transition-colors hover:text-mist hover:underline focus-visible:ring-2 focus-visible:ring-candle/40"
              >
                Keep both
              </button>
            </div>
          </motion.li>
        ))}
      </ul>
    </section>
  );
}
