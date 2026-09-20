import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Source, SourceAvailability } from "./types.js";

/**
 * Tools we can detect but cannot account for.
 *
 * Not every AI CLI writes token usage to disk. Some bill by subscription and
 * keep usage server-side; others log only conversation text. For those, the
 * honest thing is to say so — a leaderboard that silently counts a tool as
 * zero is worse than one that admits it cannot see it, because the user has no
 * way to tell the difference between "unused" and "unreadable".
 *
 * Each entry records what was actually checked, so the claim is falsifiable and
 * can be revisited when a tool changes.
 */

interface UnreadableSpec {
  id: string;
  name: string;
  /** Paths whose presence means the tool is installed. */
  markers: string[];
  /** Shown to the user; should say what was checked. */
  reason: string;
}

const SPECS: UnreadableSpec[] = [
  {
    id: "cursor",
    name: "Cursor",
    markers: [path.join(os.homedir(), ".cursor")],
    // Verified: every blob across ~/.cursor/chats/*/*/store.db was scanned —
    // 18,339 blobs, 1,968 assistant messages, zero token or usage fields.
    // Cursor keeps usage server-side, on its own dashboard.
    reason: "stores no token counts locally — usage lives in your Cursor dashboard",
  },
  {
    id: "gemini-cli",
    name: "Gemini CLI",
    markers: [path.join(os.homedir(), ".gemini")],
    reason: "no local usage records found — enable its telemetry export to track it",
  },
  {
    id: "aider",
    name: "Aider",
    markers: [
      path.join(os.homedir(), ".aider-desk"),
      path.join(os.homedir(), ".aider.chat.history.md"),
    ],
    reason: "writes chat history without per-request token accounting",
  },
];

function makeSource(spec: UnreadableSpec): Source {
  return {
    id: spec.id,
    name: spec.name,

    async detect(): Promise<SourceAvailability> {
      for (const marker of spec.markers) {
        try {
          await fs.access(marker);
          return { state: "no-local-usage", reason: spec.reason };
        } catch {
          // Try the next marker.
        }
      }
      return { state: "absent" };
    },

    async collect() {
      return { events: [], stats: { events: 0, duplicates: 0, failures: 0 } };
    },
  };
}

export const unreadableSources: Source[] = SPECS.map(makeSource);
