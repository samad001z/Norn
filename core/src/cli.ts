#!/usr/bin/env node
/**
 * A tiny CLI for exercising the memory engine without the dashboard.
 *
 *   norn remember "<content>" [--tags a,b] [--project p]
 *   norn recall   "<query>"   [--limit n] [--budget tokens] [--project p]
 *   norn list                 [--project p]
 *   norn forget   "<id>"
 *
 * The store lives at $NORN_DB_PATH (default ./norn.db).
 */
import { MiniLMEmbedder, SqliteStorage, defaultDbPath, type Memory } from "./index.js";

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

  norn remember "<content>" [--tags a,b] [--project p]
  norn recall   "<query>"   [--limit n] [--budget tokens] [--project p]
  norn list                 [--project p]
  norn forget   "<id>"
`;

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  const { positionals, flags } = parse(rest);

  const storage = new SqliteStorage({
    path: defaultDbPath(),
    embedder: new MiniLMEmbedder(),
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
        });
        console.log(
          results.length
            ? results.map((r) => format(r, r.score)).join("\n")
            : "No memories matched.",
        );
        break;
      }
      case "list": {
        const memories = await storage.list({ project: flags.project });
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
