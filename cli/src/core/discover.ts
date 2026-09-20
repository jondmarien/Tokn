import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/**
 * Locating session transcripts on disk.
 *
 * Both Claude Code in the terminal and Claude Desktop's agent mode write the
 * same JSONL transcript format, so one parser serves both — they differ only in
 * where the files live and how deeply they are nested.
 */

export type SourceKind = "claude-code" | "claude-desktop";

export interface SessionFile {
  path: string;
  source: SourceKind;
  size: number;
  mtimeMs: number;
}

export interface SourceRoot {
  dir: string;
  source: SourceKind;
  /**
   * Recursion guard only, not a filter. Transcripts nest much deeper than the
   * obvious `projects/<cwd>/<session>.jsonl` layout suggests — subagent and
   * workflow runs land in `<session>/subagents/workflows/<wf>/agent-*.jsonl`,
   * and Desktop wraps its own `.claude/projects` tree inside each agent-mode
   * session. Those are real billed requests, so the cap has to clear them
   * comfortably. Symlinks are skipped outright, so no cycle can occur.
   */
  maxDepth: number;
}

/** The Claude Code config directory, honouring the documented override. */
function claudeConfigDir(): string {
  const override = process.env.CLAUDE_CONFIG_DIR;
  if (override) return override;
  return path.join(os.homedir(), ".claude");
}

/** Platform location of Claude Desktop's application-support directory. */
function desktopSupportDir(): string | null {
  const home = os.homedir();
  switch (process.platform) {
    case "darwin":
      return path.join(home, "Library", "Application Support", "Claude");
    case "win32": {
      const appData = process.env.APPDATA ?? path.join(home, "AppData", "Roaming");
      return path.join(appData, "Claude");
    }
    case "linux":
      return path.join(process.env.XDG_CONFIG_HOME ?? path.join(home, ".config"), "Claude");
    default:
      return null;
  }
}

export function candidateRoots(): SourceRoot[] {
  const roots: SourceRoot[] = [
    { dir: path.join(claudeConfigDir(), "projects"), source: "claude-code", maxDepth: 12 },
  ];

  const desktop = desktopSupportDir();
  if (desktop) {
    roots.push({
      dir: path.join(desktop, "local-agent-mode-sessions"),
      source: "claude-desktop",
      maxDepth: 12,
    });
  }

  return roots;
}

async function isDirectory(p: string): Promise<boolean> {
  try {
    const stat = await fs.stat(p);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

/** Recursively collect `*.jsonl` beneath `dir`, bounded by `maxDepth`. */
async function walk(
  dir: string,
  source: SourceKind,
  maxDepth: number,
  out: SessionFile[],
  depth = 0,
): Promise<void> {
  if (depth > maxDepth) return;

  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    // Unreadable directory (permissions, a race with cleanup) — skip quietly.
    return;
  }

  for (const entry of entries) {
    const full = path.join(dir, entry.name);

    // Never follow symlinks: a loop would hang the scan.
    if (entry.isSymbolicLink()) continue;

    if (entry.isDirectory()) {
      await walk(full, source, maxDepth, out, depth + 1);
      continue;
    }

    if (!entry.isFile() || !entry.name.endsWith(".jsonl")) continue;

    try {
      const stat = await fs.stat(full);
      out.push({ path: full, source, size: stat.size, mtimeMs: stat.mtimeMs });
    } catch {
      // Vanished between readdir and stat.
    }
  }
}

export interface DiscoveryResult {
  files: SessionFile[];
  /** Roots that exist and were searched — used to tell the user what we read. */
  searched: SourceRoot[];
}

export async function discoverSessions(): Promise<DiscoveryResult> {
  const files: SessionFile[] = [];
  const searched: SourceRoot[] = [];

  for (const root of candidateRoots()) {
    if (!(await isDirectory(root.dir))) continue;
    searched.push(root);
    await walk(root.dir, root.source, root.maxDepth, files);
  }

  // Largest first: the progress line then moves fast at the end rather than
  // appearing to stall on one big file.
  files.sort((a, b) => b.size - a.size);
  return { files, searched };
}

export function describeSource(source: SourceKind): string {
  return source === "claude-code" ? "Claude Code" : "Claude Desktop";
}
