import { Spinner } from "../ui/spinner.js";
import { fullNumber, pluralize } from "../ui/format.js";
import { aggregate, type Aggregation } from "./aggregate.js";
import { collectAll, type SourceResult } from "./sources/registry.js";
import type { UsageEvent } from "./sources/types.js";
import type { ModelPrice } from "./pricing.js";

/**
 * The scan pipeline shared by `tokn scan` and `tokn sync`: ask every source
 * adapter for its usage, then roll the combined events up.
 */

export interface ScanResult {
  aggregation: Aggregation;
  sources: SourceResult[];
  elapsedMs: number;
  /**
   * The raw events, only when `keepEvents` was asked for.
   *
   * Absent by default and deliberately so: the merge below drops each source's
   * copy as soon as it is merged, because a heavy machine holds 37k events and
   * keeping two references to them was measurable. Views that need per-event
   * detail — project, branch, session — opt in and pay for it.
   */
  events?: UsageEvent[];
}

export interface RunScanOptions {
  since?: string;
  pricing?: Record<string, ModelPrice>;
  /** Restrict the scan to these source ids. */
  only?: string[];
  /** Suppress the spinner — used by `--json` so stderr stays quiet. */
  quiet?: boolean;
  /** Return the events instead of freeing them after aggregation. */
  keepEvents?: boolean;
}

export class NoSessionsError extends Error {
  constructor() {
    super("no AI CLI sessions found on this machine");
    this.name = "NoSessionsError";
  }
}

export async function runScan(options: RunScanOptions = {}): Promise<ScanResult> {
  const started = Date.now();
  const spinner = options.quiet ? null : new Spinner();

  spinner?.start("Looking for AI CLIs…");

  const results = await collectAll({
    since: options.since,
    only: options.only,
    onProgress: (done, total) => {
      // No modulo throttle any more. The spinner drops a redraw whose line is
      // unchanged, so reporting every file costs nothing and lets the bar's
      // partial-block edge move on files that do not shift the percentage.
      const totalText = fullNumber(total);
      spinner?.progress(
        "Scanning",
        total > 0 ? done / total : 0,
        // Right-aligned against the total so the bar does not shuffle sideways
        // as the count grows a digit.
        `${fullNumber(done).padStart(totalText.length)}/${totalText} ${pluralize(total, "file")}`,
      );
    },
  });

  const readable = results.filter((r) => r.availability.state === "ready");
  if (readable.length === 0) {
    spinner?.clearAndStop();
    throw new NoSessionsError();
  }

  // Spreading an array into `push` passes every element as an argument, and
  // V8 throws RangeError somewhere past ~100k of them. A heavy user is already
  // at 37k; this would have become a crash report rather than a slowdown.
  const events: UsageEvent[] = [];
  for (const result of results) {
    for (const event of result.events) events.push(event);
    // The source's own copy is dead once merged. Dropping the reference lets
    // the collector reclaim it before aggregation instead of after the scan.
    result.events.length = 0;
  }
  events.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  spinner?.update("Calculating costs…");
  const aggregation = aggregate(events, options.pricing);
  spinner?.clearAndStop();

  return {
    aggregation,
    sources: results,
    elapsedMs: Date.now() - started,
    ...(options.keepEvents ? { events } : {}),
  };
}

/** Display name for a tool id, falling back to the id itself. */
export function toolName(id: string, results: SourceResult[]): string {
  const match = results.find((r) => r.source.id === id);
  if (match) return match.source.name;
  // Claude's adapter tags events by surface rather than by adapter id.
  if (id === "claude-code") return "Claude Code";
  if (id === "claude-desktop") return "Claude Desktop";
  return id;
}
