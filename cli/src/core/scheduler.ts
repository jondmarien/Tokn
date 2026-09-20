import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { candidateRoots } from "./discover.js";

/**
 * Background scheduling.
 *
 * A Claude Code hook only fires for Claude Code. It cannot cover Claude
 * Desktop, Codex, Copilot or opencode, and it cannot run at a fixed time of
 * day, because nothing guarantees a session starts then. Publishing on a
 * schedule needs the operating system's own scheduler.
 *
 * Two jobs are installed:
 *
 *   periodic  every 90 minutes, plus whenever a session directory changes
 *   daily     at 23:59 local time, to close the day out
 *
 * The daily run passes `--daily`, which bypasses the throttle. Without that a
 * sync at 23:30 would make the 23:59 run a no-op and the day would close on
 * stale figures.
 *
 * Both jobs run `tokn autosync`, which is silent, never blocks and always exits
 * 0, so a failure can never produce a notification or a stuck process. Their
 * stdout and stderr go to /dev/null: the CLI keeps its own rotated log, and
 * pointing launchd at the same file would interleave with the rewrite.
 */

const exec = promisify(execFile);

export const PERIODIC_LABEL = "dev.tokn.autosync";
export const DAILY_LABEL = "dev.tokn.daily";

/** Default gap between periodic runs. The user asked for every 1-2 hours. */
export const DEFAULT_INTERVAL_MINUTES = 90;

export const DAILY_HOUR = 23;
export const DAILY_MINUTE = 59;

export type SchedulerKind = "launchd" | "systemd" | "unsupported";

export function schedulerKind(): SchedulerKind {
  if (process.platform === "darwin") return "launchd";
  if (process.platform === "linux") return "systemd";
  return "unsupported";
}

/**
 * Absolute paths to this CLI.
 *
 * A scheduled job runs with a minimal environment: `tokn` will not be on PATH,
 * and neither will `node`. Both have to be spelled out.
 */
function selfPaths(): { node: string; script: string } {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return { node: process.execPath, script: path.resolve(here, "..", "index.js") };
}

/**
 * Paths worth watching for activity.
 *
 * kqueue fires when a directory's entries change, which is what happens when a
 * tool opens a new session, and when a database file is written. Combined with
 * the throttle inside `autosync`, a burst of activity produces at most one
 * sync. The periodic timer is the guarantee; these only make it prompt.
 */
async function watchPaths(): Promise<string[]> {
  const home = os.homedir();
  const candidates = [
    ...candidateRoots().map((root) => root.dir),
    path.join(process.env.CODEX_HOME ?? path.join(home, ".codex"), "sessions"),
    path.join(home, ".copilot", "session-store.db"),
    path.join(
      process.env.XDG_DATA_HOME ?? path.join(home, ".local", "share"),
      "opencode",
      "opencode.db",
    ),
  ];

  const present: string[] = [];
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      present.push(candidate);
    } catch {
      // Not installed. Watching a path that does not exist makes launchd
      // complain, so it is left out.
    }
  }
  return present;
}

export interface InstallResult {
  kind: SchedulerKind;
  installed: boolean;
  intervalMinutes: number;
  watching: number;
  detail?: string;
}

/* ------------------------------------------------------------------ macOS */

function agentDir(): string {
  return path.join(os.homedir(), "Library", "LaunchAgents");
}

function plistPath(label: string): string {
  return path.join(agentDir(), `${label}.plist`);
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function plist(options: {
  label: string;
  args: string[];
  interval?: number;
  calendar?: { hour: number; minute: number };
  watch?: string[];
}): string {
  const args = options.args
    .map((a) => `    <string>${xmlEscape(a)}</string>`)
    .join("\n");

  const interval = options.interval
    ? `  <key>StartInterval</key>\n  <integer>${options.interval}</integer>\n`
    : "";

  const calendar = options.calendar
    ? `  <key>StartCalendarInterval</key>\n  <dict>\n` +
      `    <key>Hour</key><integer>${options.calendar.hour}</integer>\n` +
      `    <key>Minute</key><integer>${options.calendar.minute}</integer>\n` +
      `  </dict>\n`
    : "";

  const watch =
    options.watch && options.watch.length > 0
      ? `  <key>WatchPaths</key>\n  <array>\n` +
        options.watch.map((p) => `    <string>${xmlEscape(p)}</string>`).join("\n") +
        `\n  </array>\n`
      : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${options.label}</string>
  <key>ProgramArguments</key>
  <array>
${args}
  </array>
${interval}${calendar}${watch}  <key>RunAtLoad</key>
  <false/>
  <key>ProcessType</key>
  <string>Background</string>
  <key>LowPriorityIO</key>
  <true/>
  <key>Nice</key>
  <integer>5</integer>
  <key>StandardOutPath</key>
  <string>/dev/null</string>
  <key>StandardErrorPath</key>
  <string>/dev/null</string>
</dict>
</plist>
`;
}

async function launchctl(args: string[]): Promise<void> {
  try {
    await exec("/bin/launchctl", args);
  } catch {
    // bootout on a job that is not loaded exits non-zero, which is not a
    // failure worth surfacing.
  }
}

async function installLaunchd(intervalMinutes: number): Promise<InstallResult> {
  const { node, script } = selfPaths();
  const watch = await watchPaths();
  await fs.mkdir(agentDir(), { recursive: true });

  const jobs = [
    {
      label: PERIODIC_LABEL,
      body: plist({
        label: PERIODIC_LABEL,
        args: [node, script, "autosync"],
        interval: intervalMinutes * 60,
        watch,
      }),
    },
    {
      label: DAILY_LABEL,
      body: plist({
        label: DAILY_LABEL,
        // --daily bypasses the throttle so the day always closes on fresh
        // figures, even if a periodic run happened minutes earlier.
        args: [node, script, "autosync", "--daily"],
        calendar: { hour: DAILY_HOUR, minute: DAILY_MINUTE },
      }),
    },
  ];

  const uid = process.getuid?.() ?? 0;

  for (const job of jobs) {
    const file = plistPath(job.label);
    // Unload first: launchd keeps the old definition otherwise, so an interval
    // change would not take effect until logout.
    await launchctl(["bootout", `gui/${uid}/${job.label}`]);
    await fs.writeFile(file, job.body, "utf8");
    await launchctl(["bootstrap", `gui/${uid}`, file]);
  }

  return {
    kind: "launchd",
    installed: true,
    intervalMinutes,
    watching: watch.length,
    detail: `~/Library/LaunchAgents/${PERIODIC_LABEL}.plist`,
  };
}

async function uninstallLaunchd(): Promise<number> {
  const uid = process.getuid?.() ?? 0;
  let removed = 0;

  for (const label of [PERIODIC_LABEL, DAILY_LABEL]) {
    await launchctl(["bootout", `gui/${uid}/${label}`]);
    try {
      await fs.unlink(plistPath(label));
      removed++;
    } catch {
      // Was not installed.
    }
  }
  return removed;
}

async function launchdInstalled(): Promise<boolean> {
  try {
    await fs.access(plistPath(PERIODIC_LABEL));
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ Linux */

function systemdDir(): string {
  return path.join(
    process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config"),
    "systemd",
    "user",
  );
}

async function systemctl(args: string[]): Promise<void> {
  try {
    await exec("systemctl", ["--user", ...args]);
  } catch {
    // A user manager may not be running (headless, no lingering session).
  }
}

async function installSystemd(intervalMinutes: number): Promise<InstallResult> {
  const { node, script } = selfPaths();
  const dir = systemdDir();
  await fs.mkdir(dir, { recursive: true });

  const service = (name: string, args: string) => `[Unit]
Description=tokn ${name}

[Service]
Type=oneshot
Nice=5
ExecStart=${node} ${script} autosync${args}
`;

  await fs.writeFile(path.join(dir, "tokn-autosync.service"), service("periodic sync", ""));
  await fs.writeFile(
    path.join(dir, "tokn-autosync.timer"),
    `[Unit]
Description=tokn periodic sync

[Timer]
OnBootSec=10min
OnUnitActiveSec=${intervalMinutes}min
Persistent=true

[Install]
WantedBy=timers.target
`,
  );

  await fs.writeFile(path.join(dir, "tokn-daily.service"), service("daily close", " --daily"));
  await fs.writeFile(
    path.join(dir, "tokn-daily.timer"),
    `[Unit]
Description=tokn daily close

[Timer]
OnCalendar=*-*-* ${String(DAILY_HOUR).padStart(2, "0")}:${String(DAILY_MINUTE).padStart(2, "0")}:00
Persistent=true

[Install]
WantedBy=timers.target
`,
  );

  await systemctl(["daemon-reload"]);
  await systemctl(["enable", "--now", "tokn-autosync.timer"]);
  await systemctl(["enable", "--now", "tokn-daily.timer"]);

  return {
    kind: "systemd",
    installed: true,
    intervalMinutes,
    watching: 0,
    detail: "~/.config/systemd/user/tokn-autosync.timer",
  };
}

async function uninstallSystemd(): Promise<number> {
  let removed = 0;
  for (const unit of ["tokn-autosync.timer", "tokn-daily.timer"]) {
    await systemctl(["disable", "--now", unit]);
  }
  for (const file of [
    "tokn-autosync.service",
    "tokn-autosync.timer",
    "tokn-daily.service",
    "tokn-daily.timer",
  ]) {
    try {
      await fs.unlink(path.join(systemdDir(), file));
      removed++;
    } catch {
      // Not installed.
    }
  }
  await systemctl(["daemon-reload"]);
  return removed;
}

async function systemdInstalled(): Promise<boolean> {
  try {
    await fs.access(path.join(systemdDir(), "tokn-autosync.timer"));
    return true;
  } catch {
    return false;
  }
}

/* --------------------------------------------------------------- public */

export async function installScheduler(intervalMinutes: number): Promise<InstallResult> {
  switch (schedulerKind()) {
    case "launchd":
      return installLaunchd(intervalMinutes);
    case "systemd":
      return installSystemd(intervalMinutes);
    default:
      return {
        kind: "unsupported",
        installed: false,
        intervalMinutes,
        watching: 0,
        detail: "no supported scheduler on this platform",
      };
  }
}

export async function uninstallScheduler(): Promise<number> {
  switch (schedulerKind()) {
    case "launchd":
      return uninstallLaunchd();
    case "systemd":
      return uninstallSystemd();
    default:
      return 0;
  }
}

export async function schedulerInstalled(): Promise<boolean> {
  switch (schedulerKind()) {
    case "launchd":
      return launchdInstalled();
    case "systemd":
      return systemdInstalled();
    default:
      return false;
  }
}

/** Is the job actually registered with the OS, not just written to disk? */
export async function schedulerLoaded(): Promise<boolean> {
  if (schedulerKind() !== "launchd") return schedulerInstalled();
  try {
    const { stdout } = await exec("/bin/launchctl", ["list"]);
    return stdout.includes(PERIODIC_LABEL);
  } catch {
    return false;
  }
}
