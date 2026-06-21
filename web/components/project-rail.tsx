"use client";

import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ProjectItem {
  id: string;
  label: string;
  count: number;
}

export interface ProjectRailProps {
  projects: ProjectItem[];
  active: string;
  onSelect: (id: string) => void;
  onRemember?: () => void;
}

export function ProjectRail({
  projects,
  active,
  onSelect,
  onRemember,
}: ProjectRailProps) {
  return (
    <nav className="flex flex-col gap-0.5">
      <p className="px-3 pb-2 font-mono text-[0.6875rem] uppercase tracking-[0.2em] text-fathom">
        Projects
      </p>
      {projects.map((project) => {
        const isActive = project.id === active;
        return (
          <button
            key={project.id}
            type="button"
            onClick={() => onSelect(project.id)}
            aria-current={isActive ? "true" : undefined}
            className={cn(
              "flex items-center justify-between gap-2 rounded-md px-3 py-1.5 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-candle/50",
              isActive
                ? "bg-silt/60 text-mist"
                : "text-fathom hover:bg-silt/30 hover:text-mist",
            )}
          >
            <span className="flex min-w-0 items-center gap-2">
              <span
                aria-hidden
                className={cn(
                  "size-1.5 shrink-0 rounded-full",
                  isActive ? "bg-candle" : "bg-transparent",
                )}
              />
              <span className="truncate">{project.label}</span>
            </span>
            <span className="font-mono text-xs text-fathom">
              {project.count}
            </span>
          </button>
        );
      })}
      <button
        type="button"
        onClick={onRemember}
        className="mt-3 flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-candle transition-colors outline-none hover:bg-silt/30 focus-visible:ring-2 focus-visible:ring-candle/50"
      >
        <Plus className="size-4" />
        Remember
      </button>
    </nav>
  );
}
