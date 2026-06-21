"use client";

import * as React from "react";
import { SearchBar } from "@/components/search-bar";
import { MemoryList } from "@/components/memory-list";
import { ProjectRail, type ProjectItem } from "@/components/project-rail";
import { WellShaft } from "@/components/well-shaft";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import type { Memory } from "@/components/memory-card";
import { forgetMemoryAction } from "@/app/actions";
import { cn } from "@/lib/utils";

const shorten = (s: string) => (s.length > 48 ? `${s.slice(0, 48)}…` : s);

export function Dashboard({ initialMemories }: { initialMemories: Memory[] }) {
  const [memories, setMemories] = React.useState<Memory[]>(initialMemories);
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState("all");
  const [forgotten, setForgotten] = React.useState<{ memory: Memory; index: number } | null>(null);

  const searchRef = React.useRef<HTMLInputElement>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // ⌘K / "/" focuses the well's mouth — making the on-screen hint real.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      const tag = (document.activeElement as HTMLElement | null)?.tagName;
      if (e.key === "/" && tag !== "INPUT" && tag !== "TEXTAREA") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  React.useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const projects = React.useMemo<ProjectItem[]>(() => {
    const names = Array.from(
      new Set(memories.map((m) => m.project).filter((p): p is string => p !== null)),
    ).sort();
    return [
      { id: "all", label: "All", count: memories.length },
      ...names.map((name) => ({
        id: name,
        label: name,
        count: memories.filter((m) => m.project === name).length,
      })),
      { id: "global", label: "Global", count: memories.filter((m) => m.project === null).length },
    ];
  }, [memories]);

  const visible = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return memories.filter((m) => {
      const inScope =
        active === "all" ||
        (active === "global" ? m.project === null : m.project === active);
      if (!inScope) return false;
      if (!q) return true;
      return (
        m.content.toLowerCase().includes(q) ||
        m.tags.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [memories, query, active]);

  const forget = (id: string) => {
    const index = memories.findIndex((m) => m.id === id);
    if (index === -1) return;
    if (timer.current) clearTimeout(timer.current);
    setForgotten({ memory: memories[index]!, index });
    setMemories((prev) => prev.filter((m) => m.id !== id));
    // The store delete is deferred to the end of the undo window, so Undo
    // cancels it before it ever hits disk.
    timer.current = setTimeout(() => {
      setForgotten(null);
      void forgetMemoryAction(id);
    }, 6000);
  };

  const undoForget = () => {
    if (!forgotten) return;
    if (timer.current) clearTimeout(timer.current);
    setMemories((prev) => {
      const next = [...prev];
      next.splice(Math.min(forgotten.index, next.length), 0, forgotten.memory);
      return next;
    });
    setForgotten(null);
  };

  const clearSearch = () => {
    setQuery("");
    searchRef.current?.focus();
  };

  const resetView = () => {
    setQuery("");
    setActive("all");
    searchRef.current?.focus();
  };

  return (
    <div className="min-h-[100dvh]">
      <header className="border-b border-silt">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <span className="font-display text-lg text-mist">Norn</span>
          <span className="font-mono text-xs text-fathom">local-first memory</span>
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl gap-10 px-6 py-10">
        <aside className="hidden w-52 shrink-0 md:block">
          <ProjectRail projects={projects} active={active} onSelect={setActive} />
        </aside>

        <main className="min-w-0 flex-1">
          {/* Mobile project selector */}
          <div className="mb-6 flex gap-2 overflow-x-auto pb-1 md:hidden">
            {projects.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setActive(p.id)}
                aria-current={p.id === active ? "true" : undefined}
                className={cn(
                  "shrink-0 rounded-full border px-3 py-1 text-xs transition-colors",
                  p.id === active
                    ? "border-candle/40 bg-silt/60 text-mist"
                    : "border-silt text-fathom",
                )}
              >
                {p.label}
                <span className="ml-1.5 font-mono text-[0.625rem] text-fathom">{p.count}</span>
              </button>
            ))}
          </div>

          <div className="mb-8 flex items-baseline justify-between">
            <h1 className="font-display text-[2.25rem] leading-none text-mist">memories</h1>
            <span className="font-mono text-xs text-fathom">{visible.length} shown</span>
          </div>

          <div className="relative">
            <WellShaft />
            <SearchBar
              ref={searchRef}
              value={query}
              onChange={setQuery}
              onClear={clearSearch}
            />

            <div className="mt-8">
              {forgotten && (
                <div
                  role="status"
                  aria-live="polite"
                  className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-silt bg-tide px-4 py-2.5 text-sm text-fathom"
                >
                  <span className="truncate">
                    Forgot{" "}
                    <span className="text-mist/80">“{shorten(forgotten.memory.content)}”</span>
                  </span>
                  <button
                    type="button"
                    onClick={undoForget}
                    className="shrink-0 rounded font-medium text-candle underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-candle/50"
                  >
                    Undo
                  </button>
                </div>
              )}

              {memories.length === 0 ? (
                <EmptyState onRemember={() => {}} />
              ) : visible.length === 0 ? (
                <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
                  <h2 className="font-display text-[1.75rem] italic leading-[1.15] text-mist">
                    Nothing surfaces.
                  </h2>
                  <p className="mt-3 max-w-sm text-sm leading-relaxed text-fathom">
                    No memory matches{" "}
                    {query.trim() && (
                      <span className="text-mist/80">“{query.trim()}” </span>
                    )}
                    here. Try another word or widen the search.
                  </p>
                  <Button
                    variant="outline"
                    onClick={resetView}
                    className="mt-7 border-silt bg-transparent text-mist hover:bg-silt hover:text-mist"
                  >
                    Clear search
                  </Button>
                </div>
              ) : (
                <MemoryList
                  key={`${active}|${query}`}
                  memories={visible}
                  onForget={forget}
                />
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
