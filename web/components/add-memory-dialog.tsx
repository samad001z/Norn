"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { X } from "lucide-react";
import type { Memory } from "@/components/memory-card";
import { addMemoryAction } from "@/app/actions";
import { cn } from "@/lib/utils";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="font-mono text-[0.66rem] uppercase tracking-[0.16em] text-fathom">
        {label}
      </span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

const inputCls =
  "w-full rounded-md border border-silt bg-well/60 px-3 py-2 text-[0.85rem] text-mist outline-none placeholder:text-fathom/70 transition-colors focus:border-candle/40 focus-visible:ring-2 focus-visible:ring-candle/30";

export function AddMemoryDialog({
  open,
  onClose,
  onAdded,
  projects,
}: {
  open: boolean;
  onClose: () => void;
  onAdded: (memory: Memory) => void;
  projects: string[];
}) {
  const reduce = useReducedMotion();
  const [content, setContent] = React.useState("");
  const [project, setProject] = React.useState("");
  const [tags, setTags] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) {
      setContent("");
      setProject("");
      setTags("");
      setError(null);
      setPending(false);
    }
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const submit = async () => {
    const text = content.trim();
    if (!text || pending) return;
    setPending(true);
    setError(null);
    try {
      const memory = await addMemoryAction({
        content: text,
        project: project.trim() || null,
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      });
      onAdded(memory);
      onClose();
    } catch {
      setError("Could not save. The dashboard writes to your local store.");
      setPending(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4">
          <motion.div
            className="absolute inset-0 bg-black/55"
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-label="Add memory"
            className="relative w-full max-w-lg overflow-hidden rounded-xl border border-silt bg-[#0b0f15] shadow-[0_40px_120px_-30px_rgba(0,0,0,0.9)]"
            initial={reduce ? false : { opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? undefined : { opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
          >
            <header className="flex items-center justify-between border-b border-silt px-5 py-4">
              <span className="font-mono text-[0.66rem] uppercase tracking-[0.2em] text-ember">
                New memory
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

            <div className="space-y-4 p-5">
              <Field label="Memory">
                <textarea
                  autoFocus
                  rows={3}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit();
                  }}
                  placeholder="Something worth remembering…"
                  className={cn(inputCls, "resize-none leading-relaxed")}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Project">
                  <input
                    list="norn-projects"
                    value={project}
                    onChange={(e) => setProject(e.target.value)}
                    placeholder="global"
                    className={inputCls}
                  />
                  <datalist id="norn-projects">
                    {projects.map((p) => (
                      <option key={p} value={p} />
                    ))}
                  </datalist>
                </Field>
                <Field label="Tags (comma-sep)">
                  <input
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                    placeholder="ops, deploy"
                    className={inputCls}
                  />
                </Field>
              </div>
              {error && <p className="font-mono text-[0.72rem] text-destructive">{error}</p>}
            </div>

            <footer className="flex items-center justify-between gap-3 border-t border-silt px-5 py-4">
              <span className="font-mono text-[0.66rem] text-fathom">⌘↵ to save</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex h-9 items-center rounded-md border border-silt bg-transparent px-4 font-mono text-[0.75rem] text-fathom outline-none transition-colors hover:text-mist focus-visible:ring-2 focus-visible:ring-candle/40"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={submit}
                  disabled={!content.trim() || pending}
                  className="inline-flex h-9 items-center rounded-md bg-candle px-4 font-mono text-[0.75rem] font-semibold text-well shadow-[0_0_24px_-8px_rgba(233,184,122,0.8)] outline-none transition-all hover:bg-filament focus-visible:ring-2 focus-visible:ring-candle/60 disabled:opacity-40 disabled:shadow-none"
                >
                  {pending ? "Saving…" : "Add memory"}
                </button>
              </div>
            </footer>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
