# Norn — Project Context

## What this is
A local-first memory layer for AI coding tools. An MCP server that remembers context
across sessions/projects, plus a dashboard to SEE, SEARCH, EDIT, DELETE every memory.
The differentiator is transparency + control + craft — not the retrieval algorithm.

## Stack (v1)
- MCP server: TypeScript, @modelcontextprotocol/sdk
- Store: local SQLite + sqlite-vec (local-first = privacy + zero infra). Supabase
  pgvector later, only when cloud sync is needed.
- Embeddings: small embedding model (swappable behind an interface).
- Dashboard: Next.js (App Router) + TypeScript + Tailwind + shadcn/ui + Framer Motion.

## v1 scope — build ONLY this
- MCP tools: remember(), recall(), forget(), list()
- Dashboard: list memories, full-text + semantic search, inline edit, delete,
  per-project grouping.
- One "wow": it just remembers, and you can see everything.

## NOT in v1 (resist)
Teams, multi-user, auth beyond local, billing, voice, 10 framework integrations.

## Design direction (do NOT use generic AI-slop looks)
- Mood: premium, quiet, editorial. Think "the well of memory" — depth, calm, precision.
- Spend boldness in ONE signature element; keep everything else disciplined and quiet.
- Typography carries the personality: pick a characterful display face used sparingly +
  a clean body face + a mono/utility face for memory metadata. Set a real type scale.
- Avoid the three AI defaults: cream+serif+terracotta; near-black+acid-green; broadsheet
  hairline columns. If you reach for one, justify it or change it.
- Quality floor, non-negotiable: responsive to mobile, visible keyboard focus,
  prefers-reduced-motion respected.
- Copy is design material: name things by what the user controls ("Forget this memory",
  not "Delete vector"). Active voice. Empty states invite action.

## Working rules
- Update this file when decisions change. Small commits. Ask before adding scope.

## Repo layout (decided)
- `/core`   — `@samad001z/norn-core`: `Storage` interface + `SqliteStorage` (SQLite + sqlite-vec),
              swappable `Embedder` interface. Shared by server and web.
- `/server` — `@samad001z/norn-server`: MCP server over stdio. Tools: `remember(content, tags?,
              project?)`, `recall(query, limit?)`, `forget(id)`, `list(project?)`.

## Store resolution & isolation (decided)
- `resolveStore(cwd)` in `/core` returns `{ dbPath, scope, isolate }`. Path precedence:
  (1) `NORN_DB_PATH` if set, (2) nearest project-local `.norn/norn.db` walking up from cwd,
  (3) global `~/.norn/norn.db`. `resolveDbPath()` (path only) is kept for back-compat.
  Server, CLI, and web all resolve through `resolveStore`, so they agree per project.
- **Primary isolation = separate db files.** `norn init` (`initProjectStore`) scaffolds
  `<repo>/.norn/` with a `.gitignore` that commits `norn.db` and ignores the WAL sidecars.
  The committed db ships memory with the repo.
- **Defense in depth = the `scope` column** (project root path, auto-stamped on write;
  distinct from the freeform `project` label). `recall`/`list` filter `scope = current OR
  scope IS NULL` (null = global, visible everywhere). `isolate` is **false** for dedicated
  `.norn` dbs (the file is the boundary; not filtering keeps a committed db portable across
  machines where the absolute root path differs) and for `NORN_DB_PATH` overrides (pooled,
  back-compat); **true** for the shared global db, so un-`init`ed projects don't pool there.
- Migration: `addScopeColumn()` runs `ALTER TABLE memories ADD COLUMN scope TEXT` only if
  absent. Pre-scope rows become `scope = NULL` = global → still visible, no data loss.
- The dashboard lists across all scopes (shows the whole store file it opened); the MCP
  tools and CLI apply the scope filter so an agent only sees its own + global memories.
- Backward compatible: no `.norn` and no env var → global store, with new writes isolated
  by cwd project root.
- **Git-friendly export/import (decided).** The committed db is binary SQLite (holds
  vectors and diffs poorly), so `core/transfer.ts` adds a human-readable companion at
  `.norn/memory.json`. `norn export` serializes the project's memories (text, tags,
  project, id, timestamps) — never embeddings (regenerated) and never `scope` (a
  machine-specific absolute path that would churn diffs); output is deterministic (stable
  key + memory order, trailing newline) so re-exports diff cleanly. `norn import` rebuilds
  rows via `Storage.restore()` (upsert by id → idempotent), re-embedding locally with
  MiniLM. CLI-only by design — NOT MCP tools: repo-maintenance ops that wipe/rebuild the
  store don't belong on the agent's remember/recall/forget/list surface (dashboard buttons
  are the future home). Commit `memory.json` for clean diffs; the db stays the source of truth.
- `/web`    — `@samad001z/norn-web`: Next.js App Router + Tailwind + shadcn/ui. UI not built yet.
- npm workspaces. Build order: core → server → web (server/web consume core's `dist`).
