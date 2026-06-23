#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  MiniLMEmbedder,
  SqliteStorage,
  resolveStore,
  type Memory,
  type RecallResult,
  type Storage,
} from "@samad001z/norn-core";

// Resolve the store for the directory the client launched us in: a project-local
// .norn store, an explicit NORN_DB_PATH, or the global store. `scope` is stamped
// on writes; `filterScope` is applied to recall/list so this project only ever
// surfaces its own (and global) memories.
const { dbPath, scope, isolate } = resolveStore();
const filterScope = isolate ? scope : undefined;
const storage: Storage = new SqliteStorage({
  path: dbPath,
  embedder: new MiniLMEmbedder(),
  scope,
});

const server = new McpServer({
  name: "norn",
  version: "0.1.0",
});

const projectArg = z
  .string()
  .min(1)
  .optional()
  .describe("Project this memory belongs to. Omit for a global memory.");

function line(m: Memory): string {
  const scope = m.project ? `[${m.project}]` : "[global]";
  const tags = m.tags.length ? `  #${m.tags.join(" #")}` : "";
  return `${scope} ${m.content}${tags}  ·  ${m.id}`;
}

server.registerTool(
  "remember",
  {
    title: "Remember",
    description:
      "Save a durable fact, decision, preference, or piece of project context so it persists across sessions and projects. Call this whenever you learn something worth remembering for later (for example a user preference, an architectural decision, or a convention).",
    inputSchema: {
      content: z.string().min(1).describe("The fact to remember, in plain language."),
      tags: z.array(z.string().min(1)).optional().describe("Freeform labels for grouping."),
      project: projectArg,
    },
  },
  async ({ content, tags, project }) => {
    const memory = await storage.remember({ content, tags, project: project ?? null });
    return { content: [{ type: "text", text: `Remembered: ${line(memory)}` }] };
  },
);

server.registerTool(
  "recall",
  {
    title: "Recall",
    description:
      "Search remembered facts by meaning and return the most relevant. Call this at the start of a task, or whenever you need prior context, before asking the user to repeat something they may have told you in an earlier session.",
    inputSchema: {
      query: z.string().min(1).describe("What you're trying to remember."),
      limit: z.number().int().positive().max(50).optional().describe("Max number of results."),
      tokenBudget: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Trim results to roughly this many tokens (default 1500)."),
    },
  },
  async ({ query, limit, tokenBudget }) => {
    const results: RecallResult[] = await storage.recall(query, {
      limit,
      tokenBudget,
      scope: filterScope,
    });
    if (results.length === 0) {
      return { content: [{ type: "text", text: "No memories matched." }] };
    }
    const text = results.map((r) => `${r.score.toFixed(2)}  ${line(r)}`).join("\n");
    return { content: [{ type: "text", text }] };
  },
);

server.registerTool(
  "forget",
  {
    title: "Forget",
    description:
      "Permanently forget a memory by its id. Get the id from list or recall first. Use when a memory is wrong, outdated, or no longer wanted.",
    inputSchema: {
      id: z.string().min(1).describe("The memory id to forget."),
    },
  },
  async ({ id }) => {
    const forgotten = await storage.forget(id);
    return {
      content: [{ type: "text", text: forgotten ? `Forgot ${id}.` : `No memory with id ${id}.` }],
    };
  },
);

server.registerTool(
  "list",
  {
    title: "List",
    description:
      "List remembered facts, newest first, optionally filtered to a project. Use to browse everything currently stored, or to find a memory's id before forgetting it.",
    inputSchema: {
      project: projectArg,
    },
  },
  async ({ project }) => {
    const memories = await storage.list({ project, scope: filterScope });
    if (memories.length === 0) {
      return { content: [{ type: "text", text: "Nothing remembered yet." }] };
    }
    return { content: [{ type: "text", text: memories.map(line).join("\n") }] };
  },
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stdio servers communicate over stdout/stdin; log to stderr only.
  process.stderr.write(`norn mcp server ready (store: ${dbPath})\n`);
}

main().catch((err) => {
  process.stderr.write(`norn mcp server failed: ${String(err)}\n`);
  process.exit(1);
});
