# Norn

Persistent, visible memory for AI coding agents.

<!-- DEMO GIF: record a short screen capture (agent remembers, then recalls in a
new session) and save it as docs/demo.gif, then replace this comment with:
![Norn demo](docs/demo.gif) -->

Your AI forgets you every session. Norn is a local MCP server that remembers your
decisions, preferences, and project context across every session and project, for
Claude Code, Cursor, and any MCP client. Unlike most memory tools it is fully local
and fully inspectable: a dashboard lets you see exactly what it stored and forget
anything you do not want.

## Quickstart

Requires Node 20+.

```bash
git clone https://github.com/samad001z/Norn.git
cd Norn
npm install
npm run build -w @samad001z/norn-core && npm run build -w @samad001z/norn-server
```

Add it to Claude Code (run from the repo root):

```bash
claude mcp add norn -- node "$(pwd)/server/dist/index.js"
```

For Cursor, Claude Desktop, or any MCP client, point the standard config at the same
entry with an absolute path:

```json
{
  "mcpServers": {
    "norn": {
      "command": "node",
      "args": ["/absolute/path/to/Norn/server/dist/index.js"]
    }
  }
}
```

Once Norn is published to npm, you can skip the clone and run it with npx:

```bash
claude mcp add norn -- npx -y @samad001z/norn-server
```

Restart your agent. Norn registers four tools: `remember`, `recall`, `forget`, `list`.

> The first `remember` or `recall` downloads a local embedding model
> (all-MiniLM-L6-v2, ~25 MB) once, then runs fully offline.

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

```bash
npm run dev:web
# open http://localhost:3000/app
```

![The Norn dashboard: browse by project, search, and forget your memories](web/public/app-screenshot.png)

You can also inspect the store from the command line:

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
