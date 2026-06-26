"use client";

import { Edit, MoreHorizontal, Trash2 } from "lucide-react";
import type { StalenessLevel } from "@samad001z/norn-core";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface Memory {
  id: string;
  content: string;
  tags: string[];
  project: string | null;
  updatedAt: string;
  /**
   * Computed freshness, surfaced so the user can prune at a glance. "fresh" shows
   * nothing; "aging"/"stale" get a quiet indicator. Read-time only — never stored.
   */
  staleness: StalenessLevel;
  /** Ids of memories this one may contradict, surfaced for the conflict-review panel. */
  conflictsWith: string[];
}

/**
 * A small, calm freshness marker — a guttering-candle dot, not an alarm. Fresh
 * memories render nothing. The `title` gives the plain-language "why" on hover.
 */
function StalenessMark({ level }: { level: StalenessLevel }) {
  if (level === "fresh") return null;
  const stale = level === "stale";
  return (
    <span
      title={
        stale
          ? "Not recalled in a while. Review it — forget it if it no longer earns its place."
          : "Cooling — not recalled recently."
      }
      className={cn(
        "inline-flex items-center gap-1.5",
        stale ? "text-ember" : "text-fathom",
      )}
    >
      <span
        aria-hidden
        className={cn("size-1.5 rounded-full", stale ? "bg-ember/80" : "bg-fathom/60")}
      />
      {level}
    </span>
  );
}

export interface MemoryCardProps {
  memory: Memory;
  onEdit?: (id: string) => void;
  onForget?: (id: string) => void;
}

function formatRelativeTime(dateString: string): string {
  const diff = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  if (diff < 2592000) return `${Math.floor(diff / 604800)}w ago`;
  return `${Math.floor(diff / 2592000)}mo ago`;
}

export function MemoryCard({ memory, onEdit, onForget }: MemoryCardProps) {
  return (
    <article className="group relative overflow-hidden rounded-lg border border-silt bg-tide transition-colors hover:border-fathom/40">
      {/* the light catches the rim */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-px bg-candle opacity-0 transition-opacity duration-300 group-hover:opacity-70"
      />
      <div className="flex items-start justify-between gap-3 p-5">
        <div className="min-w-0 flex-1 space-y-3">
          <p className="font-display text-[1.0625rem] leading-relaxed text-mist">
            {memory.content}
          </p>

          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 font-mono text-[0.8125rem] text-fathom">
            {memory.tags.length > 0 && (
              <div className="flex flex-wrap gap-x-2">
                {memory.tags.map((tag) => (
                  <span key={tag}>#{tag}</span>
                ))}
              </div>
            )}
            <span className="ml-auto inline-flex items-center gap-2 whitespace-nowrap">
              <StalenessMark level={memory.staleness} />
              {memory.staleness !== "fresh" && (
                <span aria-hidden className="text-silt">
                  ·
                </span>
              )}
              {memory.project && (
                <>
                  <span className="text-mist/70">{memory.project}</span>
                  <span aria-hidden className="text-silt">
                    ·
                  </span>
                </>
              )}
              <time dateTime={memory.updatedAt}>
                {formatRelativeTime(memory.updatedAt)}
              </time>
            </span>
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Memory options"
              className="size-8 shrink-0 text-fathom opacity-100 transition hover:bg-silt hover:text-mist focus-visible:opacity-100 md:opacity-0 md:group-hover:opacity-100"
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-44 border-silt bg-popover"
          >
            <DropdownMenuItem
              onClick={() => onEdit?.(memory.id)}
              className="text-mist focus:bg-silt focus:text-mist"
            >
              <Edit className="mr-2 size-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onClick={() => onForget?.(memory.id)}
              className="focus:bg-destructive/15"
            >
              <Trash2 className="mr-2 size-4" />
              Forget this memory
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </article>
  );
}
