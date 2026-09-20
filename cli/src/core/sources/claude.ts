import { discoverSessions } from "../discover.js";
import { parseSessions } from "../parse.js";
import type { CollectOptions, Source, SourceAvailability } from "./types.js";

/**
 * Claude Code (terminal) and Claude Desktop (agent mode).
 *
 * Both write the same JSONL transcript format, so one adapter covers them and
 * tags each event with which surface it came from. The parsing, and the
 * de-duplication that matters so much here, live in `parse.ts`.
 */
export const claudeSource: Source = {
  id: "claude",
  name: "Claude Code",

  async detect(): Promise<SourceAvailability> {
    const { files } = await discoverSessions();
    return files.length > 0 ? { state: "ready" } : { state: "absent" };
  },

  async lastActivity(): Promise<number> {
    const { files } = await discoverSessions();
    return files.reduce((max, f) => Math.max(max, f.mtimeMs), 0);
  },

  async collect(options: CollectOptions) {
    const { files } = await discoverSessions();
    if (files.length === 0) {
      return { events: [], stats: { events: 0, duplicates: 0, failures: 0 } };
    }

    const { events, stats } = await parseSessions(files, {
      since: options.since,
      onProgress: options.onProgress,
    });

    return {
      events,
      stats: {
        events: events.length,
        duplicates: stats.duplicatesSkipped,
        failures: stats.filesFailed,
        detail: `${files.length} ${files.length === 1 ? "transcript" : "transcripts"}`,
      },
    };
  },
};
