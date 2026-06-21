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
- `/web`    — `@samad001z/norn-web`: Next.js App Router + Tailwind + shadcn/ui. UI not built yet.
- npm workspaces. Build order: core → server → web (server/web consume core's `dist`).
