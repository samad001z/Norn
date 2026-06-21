"use client";

import * as React from "react";
import { Search, X } from "lucide-react";

export interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  onClear?: () => void;
  placeholder?: string;
}

export const SearchBar = React.forwardRef<HTMLInputElement, SearchBarProps>(
  function SearchBar(
    { value, onChange, onSubmit, onClear, placeholder = "Recall a memory…" },
    ref,
  ) {
    const hasValue = value.length > 0;
    return (
      <div className="relative w-full">
        <label htmlFor="memory-search" className="sr-only">
          Recall a memory
        </label>
        <Search
          aria-hidden
          className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-fathom"
        />
        <input
          id="memory-search"
          ref={ref}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSubmit?.();
            if (e.key === "Escape" && hasValue) {
              e.preventDefault();
              onClear?.();
            }
          }}
          placeholder={placeholder}
          className="h-14 w-full rounded-lg border border-silt bg-tide pl-12 pr-16 font-display text-lg text-mist outline-none transition-colors placeholder:font-sans placeholder:text-fathom focus-visible:border-candle/50 focus-visible:ring-2 focus-visible:ring-candle/35"
        />
        {hasValue ? (
          <button
            type="button"
            onClick={onClear}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-md text-fathom transition-colors outline-none hover:bg-silt hover:text-mist focus-visible:ring-2 focus-visible:ring-candle/50"
          >
            <X className="size-4" />
          </button>
        ) : (
          <kbd className="pointer-events-none absolute right-4 top-1/2 hidden -translate-y-1/2 select-none items-center rounded border border-silt bg-well px-1.5 py-0.5 font-mono text-[0.6875rem] text-fathom sm:inline-flex">
            ⌘K
          </kbd>
        )}
      </div>
    );
  },
);
