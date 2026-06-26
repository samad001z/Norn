# Connect Norn to your AI tool

Norn gives your AI coding assistant a memory that survives across sessions. This
guide gets it connected in a few minutes — no deep terminal knowledge needed.
Every step is copy-paste.

## What you need (30 seconds)

Just **Node.js, version 20 or newer**. That's the only requirement — you do **not**
install Norn separately; the setup command below downloads it automatically the
first time it runs.

Check what you have:

```bash
node --version
```

- `v20.x.x` or higher → you're set.
- A lower number, or "command not found" → install the **LTS** version from
  **https://nodejs.org** (the big green button), then check again.

## Quickstart (works for most tools)

The MCP server command is the same everywhere:

```
npx -y @samad001z/norn-server
```

Three steps:

1. **Have Node 20+** (checked above). Nothing else to install.
2. **Add Norn to your tool** using the exact config for your tool below. Most use a
   small JSON snippet; some have a one-line command or an "Add server" button.
3. **Restart your tool, then verify:** start a new chat and say *"Remember that I
   prefer pnpm over npm."* The assistant should call Norn's **remember** tool and
   confirm. Then ask *"What package manager do I prefer?"* — it should answer
   **pnpm** by calling **recall**.

> 🕐 **First-time note:** the very first remember/recall downloads a small (~25 MB)
> embedding model **once**, so it may take a minute. After that it's instant and
> fully offline.

## Per-tool setup

The server name (`norn`) and command (`npx -y @samad001z/norn-server`) are identical
in all of them.

### Claude Code

One command in your terminal:

```bash
claude mcp add norn -- npx -y @samad001z/norn-server
```

✅ **Confirm:** run `claude mcp list` — `norn` should show as connected.

### Claude Desktop

Open the config file (easiest path: **Settings → Developer → Edit Config**), or edit
it directly:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

Paste:

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

Save, then **fully quit and reopen** Claude Desktop.

✅ **Confirm:** click the tools (🔌) icon in the chat box — `norn` should appear with
4 tools.

### Cursor

Create `~/.cursor/mcp.json` (or use **Settings → Cursor Settings → MCP → Add new
global MCP server**). Paste:

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

✅ **Confirm:** in **Settings → MCP**, `norn` shows a green dot.

### Windsurf

Open **Settings → Cascade → MCP Servers → Manage**, or edit
`~/.codeium/windsurf/mcp_config.json`. Paste:

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

Click **Refresh** in the MCP panel.

✅ **Confirm:** the MCP panel lists `norn` with its tools.

### VS Code + GitHub Copilot

> Needs GitHub Copilot with **Agent mode** enabled. VS Code uses the **`servers`** key
> (not `mcpServers`).

Create `.vscode/mcp.json` in your project (or **Command Palette → "MCP: Add
Server"**). Paste:

```json
{
  "servers": {
    "norn": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@samad001z/norn-server"]
    }
  }
}
```

A **Start** button appears above the server in that file — click it.

✅ **Confirm:** in Copilot Chat (Agent mode), open the tools (🛠️) menu — `norn` should
be listed.

### Gemini CLI

Edit `~/.gemini/settings.json` (create it if missing):

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

Restart the `gemini` CLI.

✅ **Confirm:** run `/mcp` inside Gemini CLI — `norn` appears as connected.

### Zed

> ⚠️ **TODO — not yet verified.** Zed supports MCP (it calls them "context servers"),
> but its config schema has shifted across releases, so we haven't shipped a config we
> can guarantee is current. The server command to register is
> `npx -y @samad001z/norn-server`. Contributions welcome — see Zed's current docs at
> <https://zed.dev/docs/ai/mcp>.

### Antigravity

> ⚠️ **TODO — not yet verified.** We don't have a confirmed, current MCP config format
> for Antigravity, so this is left blank rather than guessed. The server command is
> `npx -y @samad001z/norn-server`. Contributions welcome — add it from Antigravity's
> official MCP docs.

## Optional: turn on conflict detection

By default Norn just stores and recalls. If you also want it to **flag memories that
might disagree** — so you can decide which to keep — set the environment variable
`NORN_DETECT_CONFLICTS` to `1` in your config. With the `mcpServers` style:

```json
{
  "mcpServers": {
    "norn": {
      "command": "npx",
      "args": ["-y", "@samad001z/norn-server"],
      "env": { "NORN_DETECT_CONFLICTS": "1" }
    }
  }
}
```

(For VS Code, put the same `"env"` block under the `servers` key.)

It's **off by default** and **never changes your store on its own** — it only surfaces
possible-conflict pairs for you to resolve in the dashboard. The first time it finds a
candidate it downloads a small extra model (to judge whether two notes actually
contradict); after that it stays local and offline like everything else.

## Troubleshooting — the 3 most common snags

**1. "No tools" / the server won't connect.**
Node is probably missing or too old. Run `node --version` — it must be **20+**. If
not, install the LTS from <https://nodejs.org> and restart your tool.

**2. You edited the config but nothing happened.**
Most tools read MCP config **only on startup**. Fully **quit and reopen** the app (not
just the chat panel) after saving.

**3. Windows: the server fails to start ("npx not found").**
On Windows, some tools can't run `npx` directly. Wrap it with `cmd`:

```json
{
  "mcpServers": {
    "norn": {
      "command": "cmd",
      "args": ["/c", "npx", "-y", "@samad001z/norn-server"]
    }
  }
}
```

(For VS Code, keep the `servers` key instead of `mcpServers`.)

---

Once connected, browse everything Norn remembers in the
[dashboard](../README.md#manage-your-memories) — and remember: **Norn only saves what
you ask it to.** Say "remember …" and it sticks.
