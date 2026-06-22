# Norn

Persistent, visible memory for AI coding agents.

**[Live site](https://norn-web-three.vercel.app)** · [Releases](https://github.com/samad001z/Norn/releases) · [Quickstart](#quickstart)

![The Norn dashboard: browse memories by project, search them live, and forget any one with a moment to undo](assets/demo.gif)

Your AI forgets you every session. Norn is a local MCP server that remembers your
decisions, preferences, and project context across every session and project, for
Claude Code, Cursor, and any MCP client. Unlike most memory tools it is fully local
and fully inspectable: a dashboard lets you see exactly what it stored and forget
anything you do not want.

## Quickstart

Requires Node 20+. Add Norn to Claude Code in one line, no clone:

```bash
claude mcp add norn -- npx -y @samad001z/norn-server
```

For Cursor, Claude Desktop, or any MCP client, use the standard config:

```json
{
  "mcpServers": {
    "norn": {
      "command": "npx",
      "args": ["-y", "@samad001z/norn-server"]
    }
  }
}
```

Restart your agent. Norn registers four tools: `remember`, `recall`, `forget`, `list`.

> The first `remember` or `recall` downloads a local embedding model
> (all-MiniLM-L6-v2, ~25 MB) once, then runs fully offline.

<details>
<summary>Or run from source</summary>

```bash
git clone https://github.com/samad001z/Norn.git
cd Norn
npm install
npm run build -w @samad001z/norn-core && npm run build -w @samad001z/norn-server
claude mcp add norn -- node "$(pwd)/server/dist/index.js"
```

</details>

## See it work

Memory survives across sessions, and recall is semantic: it matches meaning, not
keywords.

**Session 1**

> You: Remember that we deploy to production from the main branch on Vercel.
>
> Claude calls `remember("deploy to production from the main branch on Vercel", project: "acme")`

**Session 2, the next day, in a fresh context window**

> You: How do we ship to prod?
>
> Claude calls `recall("how do we ship to prod")`
>
> Norn returns "Deploy to production from the main branch on Vercel." even though the
> query shares no keywords with the stored note.

## How it works

Three local pieces share one local database:

```
Claude Code / Cursor  ──MCP (stdio)──►  Norn MCP server  ┐
                                                          ├──►  ~/.norn/norn.db
        Dashboard (Next.js)  ────────────────────────────┘     (SQLite + sqlite-vec)
```

- **MCP server** (`/server`): exposes `remember`, `recall`, `forget`, `list` over stdio.
- **Store** (`/core`): SQLite + sqlite-vec, with embeddings from a local MiniLM model
  (no API key). `recall` blends semantic similarity with recency and trims results to a
  token budget; `remember` dedupes near-identical notes.
- **Dashboard** (`/web`): a Next.js app to browse and manage everything.

All three default to the same file, `~/.norn/norn.db` (override with `NORN_DB_PATH`), so
a memory written by your agent appears in the dashboard, and a memory you forget in the
dashboard is gone for the agent too.

## Features

- **Remembers across sessions and projects.** Stop re-pasting CLAUDE.md by hand.
- **See everything it knows.** No black box: every memory is visible.
- **Forget anything, with undo.** Full control over what it keeps.
- **Lives in your tools over MCP.** Claude Code, Cursor, and any MCP client.
- **Local-first.** Your context, the embedding model, and the database all stay on your
  machine.

## Privacy

Local by default. The store is a SQLite file on your disk, the embedding model runs on
your machine, and nothing leaves it: no account, no API key, no telemetry. Delete
`~/.norn/norn.db` and the memory is gone.

## Manage your memories

The dashboard lets you browse by project, search, and forget any memory (with undo).
It runs from a clone of this repo (it is not part of the `npx` server package), and it
reads the same local store your agent writes to — `~/.norn/norn.db` — so whatever Norn
remembered shows up here.

Run these four commands from a fresh terminal:

```bash
git clone https://github.com/samad001z/Norn.git
cd Norn
npm install          # install dependencies
npm run build:core   # build the store package the dashboard reads through (required)
npm run dev:web      # start the dashboard
```

Then open **http://localhost:3000/app**.

> Skipping `npm run build:core` is the usual reason the dashboard opens empty: the web
> app imports the compiled store from `@samad001z/norn-core`, so that package has to be
> built once first. After that, `npm run dev:web` is all you need to reopen it.

To point the dashboard at a store in a non-default location, set `NORN_DB_PATH` to the
same path your agent uses before running `dev:web` (otherwise the default is fine):

```bash
NORN_DB_PATH=/path/to/norn.db npm run dev:web
```

![The Norn dashboard: browse by project, search, and forget your memories](web/public/app-screenshot.png)

Prefer the terminal? Inspect the same store without the dashboard:

```bash
npm run cli -w @samad001z/norn-core -- list
npm run cli -w @samad001z/norn-core -- recall "how do we deploy"
```

## Roadmap

- Swappable embedding backends (Ollama, OpenAI-compatible) behind the existing `Embedder`
  interface.
- Create and edit memories from the dashboard, not just browse and forget.
- Optional end-to-end encrypted sync, off by default.
- More editor and MCP-client integrations.

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md). The short version:

```bash
npm install
npm run build
npm test -w @samad001z/norn-core
```

## License

MIT. See [LICENSE](LICENSE).
