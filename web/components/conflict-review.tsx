"use client";

import { motion, useReducedMotion } from "motion/react";
import { GitCompare } from "lucide-react";
import type { Memory } from "@/components/memory-card";
import { formatRelative } from "@/lib/format";

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
    <div className="flex min-w-0 flex-1 flex-col gap-3 rounded-md border border-silt bg-well/50 p-4">
      <p className="text-[0.875rem] leading-relaxed text-mist">{memory.content}</p>
      <div className="mt-auto flex items-center justify-between gap-2 font-mono text-[0.66rem] text-fathom">
        <span className="truncate">
          {memory.project ?? "global"} · {formatRelative(memory.createdAt)}
        </span>
        <button
          type="button"
          onClick={onKeep}
          className="shrink-0 rounded border border-silt bg-transparent px-3 py-1 text-[0.7rem] text-mist outline-none transition-colors hover:border-candle/40 hover:text-filament focus-visible:ring-2 focus-visible:ring-candle/40"
        >
          Keep this
        </button>
      </div>
    </div>
  );
}

/**
 * Surfaces flagged "possible conflict" pairs for the user to resolve. Honest by
 * design: these are guesses, never verdicts, and nothing is deleted unless the
 * user picks a side.
 */
export function ConflictReview({ pairs, onKeep, onKeepBoth }: ConflictReviewProps) {
  const reduce = useReducedMotion();

  if (pairs.length === 0) {
    return (
      <div className="grid place-items-center rounded-lg border border-silt bg-tide/40 px-6 py-20 text-center">
        <GitCompare className="size-6 text-fathom/60" />
        <h3 className="mt-4 text-[1.05rem] text-mist">No conflicts to review</h3>
        <p className="mt-2 max-w-xs text-[0.85rem] leading-relaxed text-fathom">
          Nothing looks like it disagrees. New flags appear here as memories accumulate.
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-5 max-w-prose text-[0.875rem] leading-relaxed text-fathom">
        It&apos;s a guess, not a verdict — Norn won&apos;t change anything until you choose.
      </p>
      <ul className="space-y-4">
        {pairs.map(({ a, b }) => (
          <motion.li
            key={`${a.id}|${b.id}`}
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="rounded-lg border border-ember/25 bg-tide/60 p-4"
          >
            <div className="flex flex-col items-stretch gap-3 sm:flex-row">
              <Side memory={a} onKeep={() => onKeep(a.id, b.id)} />
              <div
                aria-hidden
                className="flex items-center justify-center font-mono text-[0.66rem] uppercase tracking-[0.18em] text-ember"
              >
                vs
              </div>
              <Side memory={b} onKeep={() => onKeep(b.id, a.id)} />
            </div>
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={() => onKeepBoth(a.id, b.id)}
                className="rounded px-2 py-1 font-mono text-[0.7rem] text-fathom underline-offset-4 outline-none transition-colors hover:text-mist hover:underline focus-visible:ring-2 focus-visible:ring-candle/40"
              >
                Keep both
              </button>
            </div>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}
