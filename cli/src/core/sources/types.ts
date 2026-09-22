import type { TokenCounts } from "../pricing.js";

/**
 * A source is one AI tool whose usage we can read from disk.
 *
 * Every tool stores usage differently — JSONL transcripts, SQLite tables,
 * per-chat databases — so each gets an adapter that normalises its records into
 * `UsageEvent`. Everything downstream (pricing, aggregation, upload) is written
 * against `UsageEvent` alone and knows nothing about individual tools.
 */

export interface UsageEvent {
  /** Which tool produced this request, e.g. "claude-code". */
  tool: string;
  /** Raw model id as the tool recorded it; normalised later for pricing. */
  model: string;
  tokens: TokenCounts;
  /** Local-time day, `YYYY-MM-DD`. */
  day: string;
  timestamp: string;
  /** Anthropic fast mode, which bills at a premium rate. */
  fast?: boolean;
  /**
   * A cost the tool computed itself. Some tools (opencode) record one; we
   * prefer our own calculation but keep theirs to fall back on for models we
   * have no rate for.
   */
  reportedCostUsd?: number;

  /* ------------------------------------------------------- local only */

  /**
   * Where the work happened, and which session it belonged to.
   *
   * Every one of these is on the wire in a Claude Code transcript already, and
   * the parser used to drop all three. They power `tokn projects`, `tokn
   * session` and `tokn when`.
   *
   * **None of it is ever uploaded.** `aggregate()` collapses events into
   * (day, tool, model, fast) buckets before anything is sent, so a project
   * path physically cannot reach the server through the sync path. That
   * matters beyond tidiness: an absolute path names the client you are
   * working for, and that is not ours to publish.
   */
  /** Absolute working directory, as the tool recorded it. */
  project?: string;
  /** Git branch at the time of the request. */
  branch?: string;
  /** The tool's own session id, for grouping requests into a sitting. */
  session?: string;
}

export interface SourceStats {
  /** Distinct API requests kept after de-duplication. */
  events: number;
  /** Records dropped because that request was already counted. */
  duplicates: number;
  /** Files or rows that could not be read. */
  failures: number;
  /** Free-form detail shown in verbose output, e.g. "194 transcripts". */
  detail?: string;
}

export interface CollectOptions {
  /** Ignore events before this local day (`YYYY-MM-DD`). */
  since?: string;
  onProgress?: (done: number, total: number) => void;
}

export type SourceAvailability =
  | { state: "ready" }
  /** Installed, but this tool does not persist usage locally at all. */
  | { state: "no-local-usage"; reason: string }
  /** Installed, but we cannot read it here (e.g. missing node:sqlite). */
  | { state: "unavailable"; reason: string }
  /** Not installed on this machine. */
  | { state: "absent" };

export interface Source {
  /** Stable identifier used in the upload payload. */
  id: string;
  /** Human-readable name for reports. */
  name: string;
  /** Is this tool present on this machine, and can we read its usage? */
  detect(): Promise<SourceAvailability>;
  collect(options: CollectOptions): Promise<{ events: UsageEvent[]; stats: SourceStats }>;
  /**
   * Epoch ms of the newest activity, from file mtimes alone — no parsing.
   * Lets `tokn autosync` decide in milliseconds whether a full scan is worth
   * running at all. Returns 0 when unknown.
   */
  lastActivity?(): Promise<number>;
}

/** Newest mtime across a set of paths; 0 if none are readable. */
export async function newestMtime(paths: string[]): Promise<number> {
  const { stat } = await import("node:fs/promises");
  let newest = 0;
  for (const p of paths) {
    try {
      const s = await stat(p);
      if (s.mtimeMs > newest) newest = s.mtimeMs;
    } catch {
      // Missing or unreadable — contributes nothing.
    }
  }
  return newest;
}

export function emptySourceStats(): SourceStats {
  return { events: 0, duplicates: 0, failures: 0 };
}

/** Local calendar day for a timestamp — users expect "today" to mean theirs. */
export function localDay(value: string | number | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "unknown";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0;
}
