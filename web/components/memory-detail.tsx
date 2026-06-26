"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, Copy, Trash2, X } from "lucide-react";
import type { Memory } from "@/components/memory-card";
import { formatStamp } from "@/lib/format";
import { cn } from "@/lib/utils";

/** A labelled metadata row in the detail panel. Mono, fixed left column. */
function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[5.5rem_1fr] gap-3 py-2.5">
      <dt className="font-mono text-[0.66rem] uppercase tracking-[0.16em] text-fathom">{label}</dt>
      <dd className="min-w-0 break-words font-mono text-[0.78rem] text-mist">{children}</dd>
    </div>
  );
}

export function MemoryDetail({
  memory,
  onClose,
  onForget,
  readOnly = false,
}: {
  memory: Memory | null;
  onClose: () => void;
  onForget: (id: string) => void;
  readOnly?: boolean;
}) {
  const reduce = useReducedMotion();
  const [copied, setCopied] = React.useState(false);

  // Close on Escape.
  React.useEffect(() => {
    if (!memory) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [memory, onClose]);

  const exportMemory = async () => {
    if (!memory) return;
    const payload = {
      id: memory.id,
      content: memory.content,
      tags: memory.tags,
      project: memory.project,
      createdAt: memory.createdAt,
      updatedAt: memory.updatedAt,
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked — no-op */
    }
  };

  return (
    <AnimatePresence>
      {memory && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-black/50"
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            key={memory.id}
            role="dialog"
            aria-label="Memory detail"
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[30rem] flex-col border-l border-silt bg-[#0b0f15]"
            initial={reduce ? false : { x: "100%" }}
            animate={{ x: 0 }}
            exit={reduce ? undefined : { x: "100%" }}
            transition={{ type: "tween", duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          >
            <header className="flex items-center justify-between border-b border-silt px-5 py-4">
              <span className="font-mono text-[0.66rem] uppercase tracking-[0.2em] text-ember">
                Memory
              </span>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="grid size-7 place-items-center rounded text-fathom outline-none transition-colors hover:bg-silt hover:text-mist focus-visible:ring-2 focus-visible:ring-candle/40"
              >
                <X className="size-4" />
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
              <p className="text-[0.95rem] leading-relaxed text-mist">{memory.content}</p>

              {memory.staleness !== "fresh" && (
                <div className="mt-4 inline-flex items-center gap-2 rounded-md border border-silt bg-well/60 px-2.5 py-1">
                  <span
                    className={cn(
                      "size-1.5 rounded-full",
                      memory.staleness === "stale" ? "bg-ember" : "bg-fathom",
                    )}
                  />
                  <span className="font-mono text-[0.66rem] uppercase tracking-[0.16em] text-fathom">
                    {memory.staleness} · not recalled recently
                  </span>
                </div>
              )}

              <dl className="mt-5 divide-y divide-silt/70 border-t border-silt/70">
                <MetaRow label="Project">{memory.project ?? "global"}</MetaRow>
                <MetaRow label="Scope">{memory.scope ?? "global"}</MetaRow>
                <MetaRow label="Created">{formatStamp(memory.createdAt)}</MetaRow>
                <MetaRow label="Updated">{formatStamp(memory.updatedAt)}</MetaRow>
                <MetaRow label="Tags">
                  {memory.tags.length > 0 ? (
                    <span className="flex flex-wrap gap-x-2 gap-y-1">
                      {memory.tags.map((t) => (
                        <span key={t} className="text-candle">#{t}</span>
                      ))}
                    </span>
                  ) : (
                    <span className="text-fathom">—</span>
                  )}
                </MetaRow>
                <MetaRow label="ID">
                  <span className="text-fathom">{memory.id}</span>
                </MetaRow>
              </dl>
            </div>

            <footer className="flex items-center gap-2 border-t border-silt px-5 py-4">
              <button
                type="button"
                onClick={exportMemory}
                className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-md border border-silt bg-white/[0.02] font-mono text-[0.75rem] text-mist outline-none transition-colors hover:border-fathom/50 hover:bg-white/[0.05] focus-visible:ring-2 focus-visible:ring-candle/40"
              >
                {copied ? <Check className="size-3.5 text-candle" /> : <Copy className="size-3.5" />}
                {copied ? "Copied" : "Export"}
              </button>
              <button
                type="button"
                disabled={readOnly}
                onClick={() => {
                  onForget(memory.id);
                  onClose();
                }}
                className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 font-mono text-[0.75rem] text-destructive outline-none transition-colors hover:bg-destructive/20 focus-visible:ring-2 focus-visible:ring-destructive/40 disabled:opacity-40"
              >
                <Trash2 className="size-3.5" />
                Forget
              </button>
            </footer>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
