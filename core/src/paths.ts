import os from "node:os";
import path from "node:path";

/**
 * The one canonical local store location. The MCP server, the dashboard, and
 * the CLI all resolve here, so a memory written by one is visible to the others
 * no matter which directory each process was launched from. Override with the
 * NORN_DB_PATH environment variable.
 */
export function defaultDbPath(): string {
  return process.env.NORN_DB_PATH ?? path.join(os.homedir(), ".norn", "norn.db");
}
