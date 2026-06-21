# Norn

A local-first memory layer for AI coding tools. An MCP server that remembers
context across sessions and projects, plus a dashboard to **see, search, edit,
and forget** every memory.

The differentiator is transparency + control + craft — not the retrieval
algorithm. Memories are yours: stored locally, fully visible, always editable.

## Monorepo layout

```
norn/
├─ core/      @norn/core   — Storage interface + SqliteStorage (SQLite + sqlite-vec),
│                            swappable Embedder. Shared by server and web.
├─ server/    @norn/server — MCP server over stdio: remember · recall · forget · list
├─ web/       @norn/web    — Next.js App Router + Tailwind + shadcn/ui (UI not built yet)
├─ package.json            — npm workspaces, root scripts
├─ tsconfig.base.json
└─ CLAUDE.md               — project context, scope, design direction
```

### The Storage seam

Both `server` and `web` talk to memory only through the `Storage` interface in
`@norn/core`. Today the implementation is `SqliteStorage` (local SQLite +
sqlite-vec) with a placeholder `HashEmbedder`. Swapping the store (e.g. remote
pgvector) or the embedding model means writing a new implementation behind the
same interface — callers don't change.

```ts
interface Storage {
  remember(input: NewMemory): Promise<Memory>;            // content, tags?, project?
  recall(query: string, opts?: RecallOptions): Promise<RecallResult[]>; // limit?
  forget(id: string): Promise<boolean>;
  list(opts?: ListOptions): Promise<Memory[]>;            // project?
  close(): Promise<void>;
}
```

## Getting started

Requires Node 20+ (see `.nvmrc` → 24).

```bash
npm install
npm run build          # builds core, then server, then web
```

### MCP server

Exposes four tools over stdio:

| Tool       | Arguments                          |
| ---------- | ---------------------------------- |
| `remember` | `content`, `tags?`, `project?`     |
| `recall`   | `query`, `limit?`                  |
| `forget`   | `id`                               |
| `list`     | `project?`                         |

```bash
npm run dev:server     # tsx watch over stdio
# or, after building:
node server/dist/index.js
```

The store path defaults to `norn.db`; override with `NORN_DB_PATH`.

`recall` is semantic relevance blended with recency, trimmed to a token budget;
`remember` dedupes near-identical content within a project (merging tags and
bumping the timestamp instead of inserting a duplicate).

### CLI (test the engine without the UI)

```bash
npm run cli -w @norn/core -- remember "deploy from main on vercel" --tags ops --project acme
npm run cli -w @norn/core -- recall "how do we ship" --limit 5 --budget 800
npm run cli -w @norn/core -- list --project acme
npm run cli -w @norn/core -- forget <id>
```

After building, the same is available as the `norn` bin.

### Tests

```bash
npm test -w @norn/core   # node:test via tsx; covers the Storage interface + ranking
```

### Web dashboard

```bash
npm run dev:web        # http://localhost:3000
```

shadcn/ui is wired (`components.json`, `lib/utils.ts`). Add components with
`npx shadcn@latest add <name>` from `web/`.

## v1 scope

- **MCP tools:** `remember()`, `recall()`, `forget()`, `list()`
- **Dashboard:** list, full-text + semantic search, inline edit, delete,
  per-project grouping
- **Store:** local SQLite + sqlite-vec (zero infra, private by default)

### Status

Skeleton. `core` implements all four operations against SQLite + sqlite-vec
using a **placeholder `HashEmbedder`** (deterministic, not semantic — swap
before v1 ships). The `web` app is a bare Next.js + shadcn skeleton; the
dashboard UI is intentionally not built yet.
