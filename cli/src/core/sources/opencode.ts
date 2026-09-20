import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { emptyTokens } from "../pricing.js";
import { hasTable, openReadOnly, sqliteAvailable, SQLITE_REQUIREMENT } from "../sqlite.js";
import { localDay, newestMtime, num, type CollectOptions, type Source, type SourceAvailability, type UsageEvent } from "./types.js";

/**
 * opencode.
 *
 * Messages live in `~/.local/share/opencode/opencode.db`, table `message`, with
 * the interesting fields inside a JSON `data` column: `modelID`, `providerID`,
 * a `tokens` object, and a `cost` opencode computed itself.
 *
 * opencode supports arbitrary providers, including local and free ones, so many
 * rows legitimately have zero tokens and zero cost. Its own `cost` is kept as
 * `reportedCostUsd` and used only as a fallback for models the catalog does not
 * price — our own calculation wins when we have a rate.
 */

function dbPath(): string {
  const dataHome = process.env.XDG_DATA_HOME ?? path.join(os.homedir(), ".local", "share");
  return path.join(dataHome, "opencode", "opencode.db");
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

interface MessageData {
  role?: string;
  modelID?: string;
  providerID?: string;
  cost?: number;
  tokens?: {
    input?: number;
    output?: number;
    reasoning?: number;
    cache?: { read?: number; write?: number };
  };
  time?: { created?: number; completed?: number };
}

export const opencodeSource: Source = {
  id: "opencode",
  name: "opencode",

  async detect(): Promise<SourceAvailability> {
    if (!(await exists(dbPath()))) return { state: "absent" };
    if (!sqliteAvailable()) return { state: "unavailable", reason: SQLITE_REQUIREMENT };
    return { state: "ready" };
  },

  async lastActivity(): Promise<number> {
    return newestMtime([dbPath(), `${dbPath()}-wal`]);
  },

  async collect(options: CollectOptions) {
    const events: UsageEvent[] = [];
    const stats = { events: 0, duplicates: 0, failures: 0, detail: undefined as string | undefined };

    const db = openReadOnly(dbPath());
    if (!db) {
      stats.failures = 1;
      return { events, stats };
    }

    try {
      if (!hasTable(db, "message")) return { events, stats };

      const rows = db.all("SELECT id, time_created, data FROM message");

      for (const row of rows) {
        if (typeof row.data !== "string") continue;

        let data: MessageData;
        try {
          data = JSON.parse(row.data) as MessageData;
        } catch {
          continue;
        }

        if (data.role !== "assistant") continue;

        const model = data.modelID;
        if (!model) continue;

        const createdMs =
          num(data.time?.created) || (typeof row.time_created === "number" ? row.time_created : 0);
        if (!createdMs) continue;

        const timestamp = new Date(createdMs).toISOString();
        const day = localDay(createdMs);
        if (day === "unknown") continue;
        if (options.since && day < options.since) continue;

        const tokens = emptyTokens();
        tokens.input = num(data.tokens?.input);
        tokens.output = num(data.tokens?.output);
        tokens.cacheRead = num(data.tokens?.cache?.read);
        tokens.cacheWrite5m = num(data.tokens?.cache?.write);

        // Reasoning tokens are already billed inside `output` by every provider
        // opencode supports, so adding them would double-count.

        const total =
          tokens.input + tokens.output + tokens.cacheRead + tokens.cacheWrite5m;
        if (total === 0) continue; // Local or free provider; nothing to bill.

        events.push({
          tool: "opencode",
          model,
          day,
          timestamp,
          tokens,
          reportedCostUsd: num(data.cost) || undefined,
        });
      }

      stats.events = events.length;
      stats.detail = `${rows.length} ${rows.length === 1 ? "message" : "messages"}`;
    } catch {
      stats.failures = 1;
    } finally {
      db.close();
    }

    return { events, stats };
  },
};
