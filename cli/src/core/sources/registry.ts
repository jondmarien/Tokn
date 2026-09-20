import { claudeSource } from "./claude.js";
import { codexSource } from "./codex.js";
import { copilotSource } from "./copilot.js";
import { opencodeSource } from "./opencode.js";
import { unreadableSources } from "./unreadable.js";
import type { CollectOptions, Source, SourceAvailability, UsageEvent } from "./types.js";

/**
 * The source registry.
 *
 * Adding support for another AI tool means writing one adapter and adding it
 * here; nothing downstream changes. Adapters that can read usage come first so
 * that reports list them before the ones we can only detect.
 */
export const SOURCES: Source[] = [
  claudeSource,
  codexSource,
  copilotSource,
  opencodeSource,
  ...unreadableSources,
];

export interface SourceResult {
  source: Source;
  availability: SourceAvailability;
  events: UsageEvent[];
  stats: { events: number; duplicates: number; failures: number; detail?: string };
}

/**
 * Detect every known tool, then collect from the ones that are readable.
 *
 * A failing adapter is contained: it is reported as unavailable and the rest of
 * the scan proceeds. One tool's corrupt database must not cost the user their
 * whole report.
 */
export async function collectAll(
  options: CollectOptions & { only?: string[] } = {},
): Promise<SourceResult[]> {
  const wanted = options.only?.length
    ? SOURCES.filter((s) => options.only?.includes(s.id))
    : SOURCES;

  const results: SourceResult[] = [];

  for (const source of wanted) {
    let availability: SourceAvailability;
    try {
      availability = await source.detect();
    } catch (error) {
      availability = { state: "unavailable", reason: (error as Error).message };
    }

    if (availability.state !== "ready") {
      results.push({
        source,
        availability,
        events: [],
        stats: { events: 0, duplicates: 0, failures: 0 },
      });
      continue;
    }

    try {
      const { events, stats } = await source.collect(options);
      results.push({ source, availability, events, stats });
    } catch (error) {
      results.push({
        source,
        availability: { state: "unavailable", reason: (error as Error).message },
        events: [],
        stats: { events: 0, duplicates: 0, failures: 1 },
      });
    }
  }

  return results;
}

/**
 * Newest activity across every source, from file mtimes only.
 *
 * `tokn autosync` uses this to decide in milliseconds whether a full scan is
 * worth running, instead of parsing everything to discover nothing changed.
 */
export async function latestActivity(): Promise<number> {
  let newest = 0;
  for (const source of SOURCES) {
    if (!source.lastActivity) continue;
    try {
      newest = Math.max(newest, await source.lastActivity());
    } catch {
      // A source that cannot report activity just does not contribute.
    }
  }
  return newest;
}

/** Tools that are installed but whose usage we cannot read. */
export function unreadable(results: SourceResult[]): { name: string; reason: string }[] {
  return results
    .filter((r) => r.availability.state === "no-local-usage" || r.availability.state === "unavailable")
    .map((r) => ({
      name: r.source.name,
      reason:
        r.availability.state === "no-local-usage" || r.availability.state === "unavailable"
          ? r.availability.reason
          : "",
    }));
}
