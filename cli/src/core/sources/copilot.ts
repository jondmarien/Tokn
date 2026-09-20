import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { emptyTokens } from "../pricing.js";
import { hasTable, openReadOnly, sqliteAvailable, SQLITE_REQUIREMENT } from "../sqlite.js";
import { localDay, newestMtime, num, type CollectOptions, type Source, type SourceAvailability, type UsageEvent } from "./types.js";

/**
 * GitHub Copilot CLI.
 *
 * Copilot keeps a first-class usage ledger: `assistant_usage_events` in
 * `~/.copilot/session-store.db`, one row per assistant request with the model
 * and a full token breakdown. No de-duplication is needed — rows are inserted
 * once, keyed by an autoincrement id.
 *
 * Note on cost: the table also carries `total_nano_aiu` and a `token_details_json`
 * with per-token-type rates, but those are denominated in GitHub's internal AI
 * Units, not dollars. Mixing them into a USD total would be wrong, so they are
 * ignored and Copilot's models are priced from the normal catalog.
 */

function dbPath(): string {
  return path.join(os.homedir(), ".copilot", "session-store.db");
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export const copilotSource: Source = {
  id: "copilot-cli",
  name: "GitHub Copilot CLI",

  async detect(): Promise<SourceAvailability> {
    if (!(await exists(dbPath()))) return { state: "absent" };
    if (!sqliteAvailable()) return { state: "unavailable", reason: SQLITE_REQUIREMENT };
    return { state: "ready" };
  },

  async lastActivity(): Promise<number> {
    // The -wal file moves ahead of the main db between checkpoints.
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
      if (!hasTable(db, "assistant_usage_events")) return { events, stats };

      const rows = db.all(
        `SELECT model, input_tokens, output_tokens, cache_read_tokens,
                cache_write_tokens, created_at
         FROM assistant_usage_events`,
      );

      for (const row of rows) {
        const model = typeof row.model === "string" ? row.model : "";
        if (!model) continue;

        const timestamp = typeof row.created_at === "string" ? row.created_at : "";
        const day = localDay(timestamp);
        if (day === "unknown") continue;
        if (options.since && day < options.since) continue;

        const tokens = emptyTokens();
        tokens.input = num(row.input_tokens);
        tokens.output = num(row.output_tokens);
        tokens.cacheRead = num(row.cache_read_tokens);
        // Copilot reports one cache-write figure with no TTL split; the 5m
        // bucket is the conservative place to put it.
        tokens.cacheWrite5m = num(row.cache_write_tokens);

        events.push({ tool: "copilot-cli", model, day, timestamp, tokens });
      }

      stats.events = events.length;
      stats.detail = `${rows.length} usage ${rows.length === 1 ? "row" : "rows"}`;
    } catch {
      stats.failures = 1;
    } finally {
      db.close();
    }

    return { events, stats };
  },
};
