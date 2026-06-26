"use client";

import * as React from "react";
import { SearchBar } from "@/components/search-bar";
import { MemoryCard, type Memory } from "@/components/memory-card";
import { EmptyState } from "@/components/empty-state";

// Step 2 preview: raw generated components with sample data, pre-restyle.
const SAMPLE: Memory[] = [
  {
    id: "mem-001",
    content: "Deploy to prod via the main branch on vercel. Staging auto-deploys from develop.",
    tags: ["ops", "deploy"],
    project: "acme-web",
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    staleness: "fresh",
    conflictsWith: [],
  },
  {
    id: "mem-002",
    content: "The team prefers tabs over spaces, and 100-character line width.",
    tags: ["style"],
    project: "acme-web",
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 45).toISOString(),
    staleness: "aging",
    conflictsWith: [],
  },
  {
    id: "mem-003",
    content: "Embeddings live behind a swappable interface. The placeholder is not semantic yet.",
    tags: ["architecture", "embeddings"],
    project: null,
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 120).toISOString(),
    staleness: "stale",
    conflictsWith: [],
  },
];

export default function Preview() {
  const [query, setQuery] = React.useState("");

  return (
    <main className="mx-auto max-w-3xl space-y-12 px-6 py-16">
      <section className="space-y-4">
        <h2 className="text-sm font-medium text-muted-foreground">Search bar</h2>
        <SearchBar value={query} onChange={setQuery} />
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-medium text-muted-foreground">Memory cards</h2>
        <div className="space-y-4">
          {SAMPLE.map((memory) => (
            <MemoryCard key={memory.id} memory={memory} />
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-medium text-muted-foreground">Empty state</h2>
        <div className="rounded-lg border border-border py-12">
          <EmptyState />
        </div>
      </section>
    </main>
  );
}
