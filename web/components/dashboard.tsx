"use client";

import * as React from "react";
import {
  ArrowDownUp,
  Database,
  FolderGit2,
  GitCompare,
  Plus,
  Search,
  Settings2,
  Trash2,
} from "lucide-react";
import type { Memory } from "@/components/memory-card";
import { ConflictReview, type ConflictPair } from "@/components/conflict-review";
import { MemoryDetail } from "@/components/memory-detail";
import { AddMemoryDialog } from "@/components/add-memory-dialog";
import { forgetMemoryAction, resolveConflictAction } from "@/app/actions";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

type View = "memories" | "projects" | "conflicts" | "config";
type Filter = "all" | "stale" | "conflicts";

const shorten = (s: string) => (s.length > 52 ? `${s.slice(0, 52)}…` : s);
const GITHUB_URL = "https://github.com/samad001z/Norn";

/** Small neural-node brand mark, gold. */
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

/** Quiet freshness marker — muted gold, never red. Fresh renders nothing. */
function Freshness({ level }: { level: Memory["staleness"] }) {
  if (level === "fresh") return null;
  const stale = level === "stale";
  return (
    <span
      title={stale ? "Not recalled in a while" : "Cooling — not recalled recently"}
      className={cn(
        "inline-flex items-center gap-1.5 font-mono text-[0.66rem]",
        stale ? "text-ember" : "text-fathom",
      )}
    >
      <span className={cn("size-1.5 rounded-full", stale ? "bg-ember/80" : "bg-fathom/60")} />
      {level}
    </span>
  );
}

export function Dashboard({
  initialMemories,
  hosted = false,
}: {
  initialMemories: Memory[];
  hosted?: boolean;
}) {
  const [memories, setMemories] = React.useState<Memory[]>(initialMemories);
  const [view, setView] = React.useState<View>("memories");
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState<Filter>("all");
  const [newestFirst, setNewestFirst] = React.useState(true);
  const [projectFilter, setProjectFilter] = React.useState<string | null>(null); // null = all
  const [selected, setSelected] = React.useState<Memory | null>(null);
  const [addOpen, setAddOpen] = React.useState(false);
  const [forgotten, setForgotten] = React.useState<{ memory: Memory; index: number } | null>(null);

  const searchRef = React.useRef<HTMLInputElement>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  // ⌘K / "/" focuses search.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setView("memories");
        searchRef.current?.focus();
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

  // ── derived ────────────────────────────────────────────────────────────────
  const projects = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of memories) counts.set(m.project ?? "global", (counts.get(m.project ?? "global") ?? 0) + 1);
    return [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name));
  }, [memories]);

  const projectNames = React.useMemo(
    () => projects.map((p) => p.name).filter((n) => n !== "global"),
    [projects],
  );

  const conflictPairs = React.useMemo<ConflictPair[]>(() => {
    const byId = new Map(memories.map((m) => [m.id, m]));
    const pairs: ConflictPair[] = [];
    for (const m of memories) {
      for (const otherId of m.conflictsWith) {
        if (m.id >= otherId) continue;
        const other = byId.get(otherId);
        if (other) pairs.push({ a: m, b: other });
      }
    }
    return pairs;
  }, [memories]);

  const staleCount = React.useMemo(() => memories.filter((m) => m.staleness === "stale").length, [memories]);

  const visible = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = memories.filter((m) => {
      if (projectFilter !== null && (m.project ?? "global") !== projectFilter) return false;
      if (filter === "stale" && m.staleness === "fresh") return false;
      if (filter === "conflicts" && m.conflictsWith.length === 0) return false;
      if (!q) return true;
      return m.content.toLowerCase().includes(q) || m.tags.some((t) => t.toLowerCase().includes(q));
    });
    return list.sort((a, b) => {
      const d = Date.parse(b.createdAt) - Date.parse(a.createdAt);
      return newestFirst ? d : -d;
    });
  }, [memories, query, filter, projectFilter, newestFirst]);

  // ── actions ──────────────────────────────────────────────────────────────
  const forget = (id: string) => {
    const index = memories.findIndex((m) => m.id === id);
    if (index === -1) return;
    if (timer.current) clearTimeout(timer.current);
    setForgotten({ memory: memories[index]!, index });
    setMemories((prev) => prev.filter((m) => m.id !== id));
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

  const keepOne = (_keepId: string, dropId: string) => forget(dropId);

  const keepBoth = (aId: string, bId: string) => {
    setMemories((prev) =>
      prev.map((m) => {
        if (m.id === aId) return { ...m, conflictsWith: m.conflictsWith.filter((x) => x !== bId) };
        if (m.id === bId) return { ...m, conflictsWith: m.conflictsWith.filter((x) => x !== aId) };
        return m;
      }),
    );
    void resolveConflictAction(aId, bId);
  };

  const onAdded = (memory: Memory) => {
    setMemories((prev) => [memory, ...prev.filter((m) => m.id !== memory.id)]);
    setView("memories");
  };

  const openProject = (name: string) => {
    setProjectFilter(name);
    setView("memories");
  };

  // ── nav ────────────────────────────────────────────────────────────────────
  const NAV: Array<{ id: View; label: string; icon: typeof Database; badge?: number; accent?: boolean }> = [
    { id: "memories", label: "Memories", icon: Database, badge: memories.length },
    { id: "projects", label: "Projects", icon: FolderGit2, badge: projects.length },
    { id: "conflicts", label: "Conflicts", icon: GitCompare, badge: conflictPairs.length, accent: conflictPairs.length > 0 },
    { id: "config", label: "Config", icon: Settings2 },
  ];

  return (
    <div className="flex min-h-[100dvh] bg-well text-mist">
      {/* ── Sidebar ── */}
      <aside className="sticky top-0 hidden h-[100dvh] w-60 shrink-0 flex-col border-r border-silt bg-[#080b10] px-3 py-5 md:flex">
        <div className="flex items-center gap-2.5 px-2">
          <NodeMark className="size-5 text-candle drop-shadow-[0_0_10px_rgba(233,184,122,0.4)]" />
          <span className="font-mono text-[0.9rem] font-medium uppercase tracking-[0.26em] text-mist">Norn</span>
          <span className="ml-auto rounded border border-silt px-1.5 py-0.5 font-mono text-[0.6rem] text-fathom">
            v1.2
          </span>
        </div>

        <nav className="mt-8 flex flex-col gap-0.5">
          {NAV.map(({ id, label, icon: Icon, badge, accent }) => {
            const active = view === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setView(id)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group flex items-center gap-3 rounded-md px-2.5 py-2 text-[0.85rem] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-candle/30",
                  active ? "bg-silt/60 text-mist" : "text-fathom hover:bg-silt/30 hover:text-mist",
                )}
              >
                <span
                  aria-hidden
                  className={cn("h-4 w-px rounded-full", active ? "bg-candle" : "bg-transparent")}
                />
                <Icon className={cn("size-4", active ? "text-candle" : "text-fathom group-hover:text-mist")} />
                {label}
                {badge !== undefined && (
                  <span
                    className={cn(
                      "ml-auto font-mono text-[0.65rem]",
                      accent ? "text-ember" : "text-fathom",
                    )}
                  >
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <button
          type="button"
          onClick={() => setAddOpen(true)}
          disabled={hosted}
          title={hosted ? "Runs against your local store" : undefined}
          className="mt-auto inline-flex h-10 items-center justify-center gap-2 rounded-md bg-candle font-mono text-[0.78rem] font-semibold text-well shadow-[0_0_24px_-8px_rgba(233,184,122,0.8)] outline-none transition-all hover:bg-filament focus-visible:ring-2 focus-visible:ring-candle/60 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
        >
          <Plus className="size-4" />
          Add memory
        </button>
      </aside>

      {/* ── Main ── */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-silt bg-well/85 px-5 backdrop-blur-md">
          {/* mobile wordmark */}
          <span className="flex items-center gap-2 md:hidden">
            <NodeMark className="size-5 text-candle" />
            <span className="font-mono text-[0.85rem] uppercase tracking-[0.2em] text-mist">Norn</span>
          </span>
          <div className="relative hidden flex-1 items-center sm:flex">
            <Search className="pointer-events-none absolute left-3 size-4 text-fathom" />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                if (view !== "memories") setView("memories");
              }}
              placeholder="Search memories…"
              className="h-9 w-full max-w-md rounded-md border border-silt bg-tide/60 pl-9 pr-3 font-mono text-[0.8rem] text-mist outline-none placeholder:text-fathom/70 transition-colors focus:border-candle/40 focus-visible:ring-2 focus-visible:ring-candle/25"
            />
            <kbd className="ml-2 hidden rounded border border-silt px-1.5 py-0.5 font-mono text-[0.6rem] text-fathom lg:inline">
              ⌘K
            </kbd>
          </div>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            disabled={hosted}
            className="ml-auto inline-flex h-9 items-center gap-2 rounded-md bg-candle px-3.5 font-mono text-[0.75rem] font-semibold text-well outline-none transition-all hover:bg-filament focus-visible:ring-2 focus-visible:ring-candle/60 disabled:opacity-40 md:hidden"
          >
            <Plus className="size-4" />
          </button>
        </header>

        {hosted && (
          <div className="border-b border-silt bg-tide/50 px-5 py-2.5 text-[0.8rem] text-fathom">
            Hosted preview — the dashboard runs against your local memory store.{" "}
            <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="text-candle underline-offset-4 hover:underline">
              Get Norn →
            </a>
          </div>
        )}

        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-5xl px-5 py-8">
            {view === "memories" && (
              <MemoriesView
                visible={visible}
                total={memories.length}
                filter={filter}
                setFilter={setFilter}
                newestFirst={newestFirst}
                toggleSort={() => setNewestFirst((v) => !v)}
                projectFilter={projectFilter}
                clearProject={() => setProjectFilter(null)}
                staleCount={staleCount}
                conflictCount={conflictPairs.length}
                projectCount={projects.length}
                onSelect={setSelected}
                onForget={forget}
                forgotten={forgotten}
                onUndo={undoForget}
                hosted={hosted}
                onAdd={() => setAddOpen(true)}
              />
            )}

            {view === "projects" && (
              <ProjectsView projects={projects} onOpen={openProject} />
            )}

            {view === "conflicts" && (
              <section>
                <Eyebrow>Possible conflicts</Eyebrow>
                <h1 className="mb-6 mt-3 font-display text-[1.9rem] leading-none text-mist">Conflicts</h1>
                <ConflictReview pairs={conflictPairs} onKeep={keepOne} onKeepBoth={keepBoth} />
              </section>
            )}

            {view === "config" && <ConfigView total={memories.length} projects={projects.length} stale={staleCount} />}
          </div>
        </main>
      </div>

      <MemoryDetail
        memory={selected}
        onClose={() => setSelected(null)}
        onForget={forget}
        readOnly={hosted}
      />
      <AddMemoryDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onAdded={onAdded}
        projects={projectNames}
      />
    </div>
  );
}

// ── shared bits ──────────────────────────────────────────────────────────────

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 font-mono text-[0.66rem] uppercase tracking-[0.22em] text-ember">
      <span aria-hidden className="h-px w-5 bg-ember/50" />
      {children}
    </span>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-md border px-3 py-1 font-mono text-[0.72rem] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-candle/30",
        active ? "border-candle/40 bg-silt/60 text-mist" : "border-silt text-fathom hover:text-mist",
      )}
    >
      {children}
    </button>
  );
}

// ── Memories view ──────────────────────────────────────────────────────────

function MemoriesView(props: {
  visible: Memory[];
  total: number;
  filter: Filter;
  setFilter: (f: Filter) => void;
  newestFirst: boolean;
  toggleSort: () => void;
  projectFilter: string | null;
  clearProject: () => void;
  staleCount: number;
  conflictCount: number;
  projectCount: number;
  onSelect: (m: Memory) => void;
  onForget: (id: string) => void;
  forgotten: { memory: Memory } | null;
  onUndo: () => void;
  hosted: boolean;
  onAdd: () => void;
}) {
  const {
    visible, total, filter, setFilter, newestFirst, toggleSort, projectFilter, clearProject,
    staleCount, conflictCount, projectCount, onSelect, onForget, forgotten, onUndo, hosted, onAdd,
  } = props;

  return (
    <section>
      <Eyebrow>Memory infrastructure</Eyebrow>
      <div className="mb-6 mt-3 flex items-end justify-between gap-4">
        <h1 className="font-display text-[1.9rem] leading-none text-mist">Memories</h1>
        <span className="font-mono text-[0.72rem] text-fathom">{visible.length} shown</span>
      </div>

      {/* controls */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Chip active={filter === "all"} onClick={() => setFilter("all")}>All</Chip>
        <Chip active={filter === "stale"} onClick={() => setFilter("stale")}>Stale</Chip>
        <Chip active={filter === "conflicts"} onClick={() => setFilter("conflicts")}>Conflicts</Chip>
        {projectFilter !== null && (
          <button
            type="button"
            onClick={clearProject}
            className="rounded-md border border-candle/30 bg-silt/50 px-3 py-1 font-mono text-[0.72rem] text-mist outline-none transition-colors hover:border-candle/50"
          >
            project: {projectFilter} ✕
          </button>
        )}
        <button
          type="button"
          onClick={toggleSort}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-silt px-3 py-1 font-mono text-[0.72rem] text-fathom outline-none transition-colors hover:text-mist focus-visible:ring-2 focus-visible:ring-candle/30"
        >
          <ArrowDownUp className="size-3.5" />
          {newestFirst ? "Newest" : "Oldest"}
        </button>
      </div>

      {/* undo toast */}
      {forgotten && (
        <div
          role="status"
          aria-live="polite"
          className="mb-3 flex items-center justify-between gap-3 rounded-md border border-silt bg-tide px-4 py-2.5 text-[0.82rem] text-fathom"
        >
          <span className="truncate">
            Forgot <span className="text-mist/80">“{shorten(forgotten.memory.content)}”</span>
          </span>
          <button
            type="button"
            onClick={onUndo}
            className="shrink-0 rounded font-mono text-[0.75rem] text-candle underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-candle/40"
          >
            Undo
          </button>
        </div>
      )}

      {/* list */}
      {total === 0 ? (
        <EmptyState
          title="No memories yet"
          body="Your agent writes here as you work — or add one yourself."
          action={!hosted ? { label: "Add memory", onClick: onAdd } : undefined}
        />
      ) : visible.length === 0 ? (
        <EmptyState title="Nothing matches" body="Try another word, or clear the filters." />
      ) : (
        <ul className="overflow-hidden rounded-lg border border-silt">
          {visible.map((m, i) => (
            <MemoryRow
              key={m.id}
              memory={m}
              index={i + 1}
              onSelect={() => onSelect(m)}
              onForget={() => onForget(m.id)}
              hosted={hosted}
            />
          ))}
        </ul>
      )}

      {/* stats */}
      {total > 0 && (
        <div className="mt-8 grid grid-cols-3 gap-3">
          <Stat label="Total memories" value={total} />
          <Stat label="Projects" value={projectCount} />
          <Stat label="Stale" value={staleCount} accent={staleCount > 0} hint={conflictCount > 0 ? `${conflictCount} flagged` : undefined} />
        </div>
      )}
    </section>
  );
}

function MemoryRow({
  memory,
  index,
  onSelect,
  onForget,
  hosted,
}: {
  memory: Memory;
  index: number;
  onSelect: () => void;
  onForget: () => void;
  hosted: boolean;
}) {
  return (
    <li className="group relative border-b border-silt/60 last:border-b-0 transition-colors hover:bg-silt/20">
      <div
        role="button"
        tabIndex={0}
        onClick={onSelect}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onSelect())}
        className="flex cursor-pointer gap-4 px-4 py-3.5 outline-none focus-visible:bg-silt/25"
      >
        <span className="mt-0.5 w-6 shrink-0 font-mono text-[0.72rem] tabular-nums text-fathom/70">
          {String(index).padStart(2, "0")}
        </span>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-[0.9rem] leading-relaxed text-mist">{memory.content}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 font-mono text-[0.68rem] text-fathom">
            <span className="text-mist/60">{memory.project ?? "global"}</span>
            <span aria-hidden className="text-silt">·</span>
            <span>{formatRelative(memory.createdAt)}</span>
            {memory.tags.length > 0 && (
              <>
                <span aria-hidden className="text-silt">·</span>
                <span className="flex flex-wrap gap-x-1.5">
                  {memory.tags.slice(0, 4).map((t) => (
                    <span key={t} className="text-candle/80">#{t}</span>
                  ))}
                </span>
              </>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3 pt-0.5">
          <Freshness level={memory.staleness} />
          {!hosted && (
            <button
              type="button"
              aria-label="Forget this memory"
              onClick={(e) => {
                e.stopPropagation();
                onForget();
              }}
              className="grid size-7 place-items-center rounded text-fathom opacity-0 outline-none transition-all hover:bg-silt hover:text-destructive focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-destructive/40 group-hover:opacity-100"
            >
              <Trash2 className="size-3.5" />
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

function Stat({
  label,
  value,
  accent,
  hint,
}: {
  label: string;
  value: number;
  accent?: boolean;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-silt bg-tide/40 p-4">
      <p className="font-mono text-[0.62rem] uppercase tracking-[0.16em] text-fathom">{label}</p>
      <p className={cn("mt-2 text-[1.75rem] font-semibold leading-none tabular-nums", accent ? "text-candle" : "text-mist")}>
        {value}
      </p>
      {hint && <p className="mt-1.5 font-mono text-[0.62rem] text-fathom">{hint}</p>}
    </div>
  );
}

function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="grid place-items-center rounded-lg border border-silt bg-tide/30 px-6 py-20 text-center">
      <Database className="size-6 text-fathom/50" />
      <h2 className="mt-4 text-[1.1rem] text-mist">{title}</h2>
      <p className="mt-2 max-w-xs text-[0.85rem] leading-relaxed text-fathom">{body}</p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-6 inline-flex h-9 items-center gap-2 rounded-md bg-candle px-4 font-mono text-[0.75rem] font-semibold text-well outline-none transition-all hover:bg-filament focus-visible:ring-2 focus-visible:ring-candle/60"
        >
          <Plus className="size-4" />
          {action.label}
        </button>
      )}
    </div>
  );
}

// ── Projects view ────────────────────────────────────────────────────────────

function ProjectsView({
  projects,
  onOpen,
}: {
  projects: Array<{ name: string; count: number }>;
  onOpen: (name: string) => void;
}) {
  return (
    <section>
      <Eyebrow>Per-project isolation</Eyebrow>
      <h1 className="mb-6 mt-3 font-display text-[1.9rem] leading-none text-mist">Projects</h1>
      {projects.length === 0 ? (
        <EmptyState title="No projects yet" body="Memories grouped by project will appear here." />
      ) : (
        <ul className="overflow-hidden rounded-lg border border-silt">
          {projects.map((p) => (
            <li key={p.name}>
              <button
                type="button"
                onClick={() => onOpen(p.name)}
                className="flex w-full items-center gap-3 border-b border-silt/60 px-4 py-3.5 text-left outline-none transition-colors last:border-b-0 hover:bg-silt/20 focus-visible:bg-silt/25"
              >
                <FolderGit2 className="size-4 text-fathom" />
                <span className="font-mono text-[0.85rem] text-mist">{p.name}</span>
                <span className="ml-auto font-mono text-[0.72rem] text-fathom">{p.count}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ── Config view ──────────────────────────────────────────────────────────────

function ConfigView({ total, projects, stale }: { total: number; projects: number; stale: number }) {
  const rows: Array<[string, React.ReactNode]> = [
    ["Store", "Local SQLite + on-device embeddings"],
    ["Mode", "Local-first · single-tenant"],
    ["Version", "v1.2"],
    ["License", "MIT"],
    ["Memories", total],
    ["Projects", projects],
    ["Stale", stale],
  ];
  return (
    <section>
      <Eyebrow>Configuration</Eyebrow>
      <h1 className="mb-6 mt-3 font-display text-[1.9rem] leading-none text-mist">Config</h1>
      <div className="rounded-lg border border-silt bg-tide/40">
        <dl className="divide-y divide-silt/60">
          {rows.map(([k, v]) => (
            <div key={k} className="grid grid-cols-[8rem_1fr] gap-3 px-5 py-3">
              <dt className="font-mono text-[0.66rem] uppercase tracking-[0.16em] text-fathom">{k}</dt>
              <dd className="font-mono text-[0.8rem] text-mist">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
      <p className="mt-4 max-w-prose text-[0.82rem] leading-relaxed text-fathom">
        Memories are written by your agent over MCP and stored on your machine. Per-project
        memory lives in <span className="font-mono text-mist/70">.norn/</span> and can be exported
        to a diffable file and committed with your repo. Nothing syncs to a cloud.
      </p>
    </section>
  );
}
