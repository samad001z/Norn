#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  HashEmbedder,
  SqliteStorage,
  type Memory,
  type RecallResult,
  type Storage,
} from "@norn/core";

const storage: Storage = new SqliteStorage({
  path: process.env.NORN_DB_PATH ?? "norn.db",
  embedder: new HashEmbedder(),
});

const server = new McpServer({
  name: "norn",
  version: "0.0.0",
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
    description: "Save a fact so it persists across sessions and projects.",
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
    description: "Find memories most relevant to a query by meaning.",
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
    const results: RecallResult[] = await storage.recall(query, { limit, tokenBudget });
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
    description: "Permanently forget a memory by its id.",
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
    description: "List remembered facts, newest first.",
    inputSchema: {
      project: projectArg,
    },
  },
  async ({ project }) => {
    const memories = await storage.list({ project });
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
  process.stderr.write("norn mcp server ready\n");
}

main().catch((err) => {
  process.stderr.write(`norn mcp server failed: ${String(err)}\n`);
  process.exit(1);
});
