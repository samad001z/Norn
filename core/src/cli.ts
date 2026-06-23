#!/usr/bin/env node
/**
 * A tiny CLI for exercising the memory engine without the dashboard.
 *
 *   norn init                 (opt this project into a committed .norn store)
 *   norn remember "<content>" [--tags a,b] [--project p]
 *   norn recall   "<query>"   [--limit n] [--budget tokens] [--project p]
 *   norn list                 [--project p]
 *   norn forget   "<id>"
 *
 * The store is resolved by resolveDbPath(): $NORN_DB_PATH if set, else the
 * nearest project-local .norn/norn.db, else the global ~/.norn/norn.db.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import {
  MiniLMEmbedder,
  SqliteStorage,
  exportMemories,
  importMemories,
  initProjectStore,
  memoryExportPath,
  parseExport,
  resolveStore,
  serializeExport,
  type Memory,
} from "./index.js";

type Flags = Record<string, string>;

function parse(args: string[]): { positionals: string[]; flags: Flags } {
  const positionals: string[] = [];
  const flags: Flags = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg.startsWith("--")) {
      flags[arg.slice(2)] = args[++i] ?? "";
    } else {
      positionals.push(arg);
    }
  }
  return { positionals, flags };
}

function tagsOf(flags: Flags): string[] | undefined {
  return flags.tags ? flags.tags.split(",").map((t) => t.trim()).filter(Boolean) : undefined;
}

function format(m: Memory, score?: number): string {
  const scope = m.project ? `[${m.project}]` : "[global]";
  const tags = m.tags.length ? `  #${m.tags.join(" #")}` : "";
  const prefix = score === undefined ? "" : `${score.toFixed(2)}  `;
  return `${prefix}${scope} ${m.content}${tags}\n        ${m.id} · ${m.updatedAt}`;
}

const USAGE = `norn — memory engine CLI

  norn init                 give this project its own committed memory store
  norn remember "<content>" [--tags a,b] [--project p]
  norn recall   "<query>"   [--limit n] [--budget tokens] [--project p]
  norn list                 [--project p]
  norn forget   "<id>"
  norn export               write this project's memories to .norn/memory.json
  norn import               rebuild memories from .norn/memory.json
`;

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  const { positionals, flags } = parse(rest);

  // `init` only touches the filesystem; it needs no embedder or open db.
  if (command === "init") {
    const { dbPath, created } = initProjectStore();
    console.log(
      created
        ? `Created ${dbPath}\nCommit the .norn directory to ship this project's memory with the repo.`
        : `${dbPath} already exists. Project memory is already set up here.`,
    );
    return;
  }

  const { dbPath, scope, isolate } = resolveStore();
  const filterScope = isolate ? scope : undefined;
  const storage = new SqliteStorage({
    path: dbPath,
    embedder: new MiniLMEmbedder(),
    scope,
  });

  try {
    switch (command) {
      case "remember": {
        const content = positionals[0];
        if (!content) throw new Error('remember needs content: norn remember "..."');
        const memory = await storage.remember({
          content,
          tags: tagsOf(flags),
          project: flags.project,
        });
        console.log("Remembered:\n" + format(memory));
        break;
      }
      case "recall": {
        const query = positionals[0];
        if (!query) throw new Error('recall needs a query: norn recall "..."');
        const results = await storage.recall(query, {
          limit: flags.limit ? Number(flags.limit) : undefined,
          tokenBudget: flags.budget ? Number(flags.budget) : undefined,
          project: flags.project,
          scope: filterScope,
        });
        console.log(
          results.length
            ? results.map((r) => format(r, r.score)).join("\n")
            : "No memories matched.",
        );
        break;
      }
      case "list": {
        const memories = await storage.list({ project: flags.project, scope: filterScope });
        console.log(
          memories.length ? memories.map((m) => format(m)).join("\n") : "Nothing remembered yet.",
        );
        break;
      }
      case "forget": {
        const id = positionals[0];
        if (!id) throw new Error("forget needs an id: norn forget <id>");
        console.log((await storage.forget(id)) ? `Forgot ${id}.` : `No memory with id ${id}.`);
        break;
      }
      case "export": {
        // Export the same memories this project can see: the whole file for a
        // dedicated .norn store, own + global when pooled in the global store.
        const exp = await exportMemories(storage, { scope: filterScope });
        const outPath = memoryExportPath(dbPath);
        writeFileSync(outPath, serializeExport(exp), "utf8");
        console.log(
          `Exported ${exp.memories.length} ${exp.memories.length === 1 ? "memory" : "memories"} to ${outPath}\n` +
            "Commit this file to ship memory with the repo; embeddings rebuild on import.",
        );
        break;
      }
      case "import": {
        const inPath = memoryExportPath(dbPath);
        if (!existsSync(inPath)) {
          throw new Error(`No export to import: ${inPath} does not exist. Run "norn export" first.`);
        }
        const exp = parseExport(readFileSync(inPath, "utf8"));
        const { imported } = await importMemories(storage, exp);
        console.log(
          `Imported ${imported} ${imported === 1 ? "memory" : "memories"} from ${inPath} (embeddings regenerated).`,
        );
        break;
      }
      default:
        console.log(USAGE);
        process.exitCode = command ? 1 : 0;
    }
  } finally {
    await storage.close();
  }
}

main().catch((err: unknown) => {
  console.error(String(err instanceof Error ? err.message : err));
  process.exit(1);
});
