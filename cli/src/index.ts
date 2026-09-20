#!/usr/bin/env node
import { ArgError, parseArgs, type ParsedArgs } from "./args.js";
import { autosyncCommand } from "./commands/autosync.js";
import { browseCommand } from "./commands/browse.js";
import { dashboardCommand } from "./commands/dashboard.js";
import { linkCommand } from "./commands/link.js";
import { scanCommand } from "./commands/scan.js";
import { setupCommand } from "./commands/setup.js";
import { sourcesCommand } from "./commands/sources.js";
import { statusCommand } from "./commands/status.js";
import { syncCommand } from "./commands/sync.js";
import { unlinkCommand } from "./commands/unlink.js";
import { ApiError } from "./core/api.js";
import { bold, dim, red, sym } from "./ui/ansi.js";
import { PromptCancelledError } from "./ui/prompt.js";
import { VERSION } from "./version.js";

type Handler = (args: ParsedArgs) => Promise<number>;

interface Command {
  run: Handler;
  summary: string;
  /** Alternate spellings, including the `gh`-style `auth ...` forms. */
  aliases?: string[];
}

const COMMANDS: Record<string, Command> = {
  setup: {
    run: setupCommand,
    summary: "Walk through first-time setup",
    aliases: ["init", "onboard"],
  },
  link: {
    run: linkCommand,
    summary: "Connect this machine to your dashboard",
    aliases: ["login", "auth:login"],
  },
  status: {
    run: statusCommand,
    summary: "Show link and sync status",
    aliases: ["auth:status"],
  },
  dashboard: {
    run: browseCommand,
    summary: "Browse the full leaderboard site in your terminal",
    aliases: ["ui", "tui", "browse"],
  },
  scan: {
    run: scanCommand,
    summary: "Show local usage without uploading",
  },
  sync: {
    run: syncCommand,
    summary: "Scan and publish to the leaderboard",
  },
  autosync: {
    run: autosyncCommand,
    summary: "Publish automatically in the background",
  },
  sources: {
    run: sourcesCommand,
    summary: "Show which AI tools are detected and tracked",
    aliases: ["tools"],
  },
  unlink: {
    run: unlinkCommand,
    summary: "Disconnect this machine",
    aliases: ["logout", "auth:logout"],
  },
};

function resolveCommand(args: ParsedArgs): Command | undefined {
  let name = args.command;
  if (!name) return undefined;

  // Accept `tokn auth login` as well as `tokn link`.
  if (name === "auth" && args.positionals[0]) {
    name = `auth:${args.positionals[0]}`;
  }

  const direct = COMMANDS[name];
  if (direct) return direct;

  for (const command of Object.values(COMMANDS)) {
    if (command.aliases?.includes(name)) return command;
  }
  return undefined;
}

function helpText(): string {
  const width = Math.max(...Object.keys(COMMANDS).map((n) => n.length));
  const commands = Object.entries(COMMANDS)
    .map(([name, command]) => `  ${bold(name.padEnd(width))}  ${dim(command.summary)}`)
    .join("\n");

  return `
${bold("tokn")} ${dim(`v${VERSION}`)} ${dim(sym.bullet)} ${dim("Track your AI coding usage.")}

${dim("USAGE")}
  tokn                 ${dim("a quick look at your usage")}
  tokn dashboard       ${dim("the full site, in your terminal")}
  tokn <command> [flags]

${dim("COMMANDS")}
${commands}

${dim("FLAGS")}
  ${bold("--last <n>")}    Only the last n days ${dim("(scan, sync)")}
  ${bold("--since <d>")}   Only from YYYY-MM-DD onward ${dim("(scan, sync)")}
  ${bold("--tools")}       Break down by tool instead of model ${dim("(scan)")}
  ${bold("--days")}        Break down by day instead of model ${dim("(scan)")}
  ${bold("--tool <id>")}   Only this source, e.g. claude ${dim("(scan)")}
  ${bold("--json")}        Machine-readable output ${dim("(scan)")}
  ${bold("--dry-run")}     Scan and show what would upload ${dim("(sync)")}
  ${bold("--every <m>")}   Minutes between background syncs ${dim("(autosync on)")}
  ${bold("--help, -h")}    Show help
  ${bold("--version, -v")} Show version

${dim("ENVIRONMENT")}
  ${bold("TOKN_HOST")}           Dashboard base URL
  ${bold("TOKN_TOKEN")}          Use this token instead of the stored one
  ${bold("CLAUDE_CONFIG_DIR")}   Where Claude Code keeps its sessions
  ${bold("NO_COLOR")}            Disable colour

${dim("EXAMPLES")}
  ${dim("$")} tokn                  ${dim("# spend, heatmap, models")}
  ${dim("$")} tokn dashboard        ${dim("# full-screen: board, profiles, friends")}
  ${dim("$")} tokn setup            ${dim("# guided first-time setup")}
  ${dim("$")} tokn scan --last 7
  ${dim("$")} tokn sync
  ${dim("$")} tokn autosync on      ${dim("# publish in the background, automatically")}
  ${dim("$")} tokn autosync on --every 120
  ${dim("$")} tokn autosync status
`;
}

/**
 * Node's built-in SQLite is still flagged experimental and prints a warning the
 * first time it loads. tokn reads several tools' SQLite histories, so that
 * notice would appear on ordinary commands and inside the autosync hook — noise
 * the user did not ask for and cannot act on.
 *
 * Filtered at the emitter rather than with `removeAllListeners("warning")`, so
 * every other warning still reaches the user untouched.
 */
const emitWarning = process.emitWarning.bind(process);
process.emitWarning = ((warning: string | Error, ...rest: unknown[]) => {
  const text = typeof warning === "string" ? warning : (warning?.message ?? "");
  if (/SQLite is an experimental feature/i.test(text)) return;
  return (emitWarning as (...a: unknown[]) => void)(warning, ...rest);
}) as typeof process.emitWarning;

async function main(): Promise<number> {
  let args: ParsedArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    if (error instanceof ArgError) {
      process.stderr.write(`\n  ${red(sym.cross)} ${error.message}\n`);
      process.stderr.write(`  ${dim("Run `tokn --help` for usage.")}\n\n`);
      return 2;
    }
    throw error;
  }

  if (args.flags.version) {
    process.stdout.write(`${VERSION}\n`);
    return 0;
  }

  if (args.flags.help) {
    process.stdout.write(helpText() + "\n");
    return 0;
  }

  // Bare `tokn` is the dashboard once a machine is set up, and the wizard
  // before that. Help is still one flag away, but it is the wrong first thing
  // to show somebody who just installed this.
  if (!args.command) {
    const { loadConfig, resolveToken } = await import("./core/config.js");
    const config = await loadConfig();
    const firstRun = !resolveToken(config) && !config.lastSyncAt && !config.linkedAt;
    return firstRun ? setupCommand(args) : dashboardCommand(args);
  }

  const command = resolveCommand(args);
  if (!command) {
    process.stderr.write(`\n  ${red(sym.cross)} Unknown command ${bold(args.command)}\n`);
    const suggestion = closestCommand(args.command);
    if (suggestion) {
      process.stderr.write(`  ${dim(`Did you mean \`tokn ${suggestion}\`?`)}\n`);
    }
    process.stderr.write(`  ${dim("Run `tokn --help` to see available commands.")}\n\n`);
    return 2;
  }

  return command.run(args);
}

/** Levenshtein-lite: good enough to catch a single typo. */
function closestCommand(input: string): string | undefined {
  let best: string | undefined;
  let bestScore = Infinity;
  for (const name of Object.keys(COMMANDS)) {
    const score = editDistance(input, name);
    if (score < bestScore) {
      bestScore = score;
      best = name;
    }
  }
  return bestScore <= 2 ? best : undefined;
}

function editDistance(a: string, b: string): number {
  const rows: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = 0; i <= a.length; i++) rows[i]![0] = i;
  for (let j = 0; j <= b.length; j++) rows[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      rows[i]![j] = Math.min(rows[i - 1]![j]! + 1, rows[i]![j - 1]! + 1, rows[i - 1]![j - 1]! + cost);
    }
  }
  return rows[a.length]![b.length]!;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    if (error instanceof PromptCancelledError) {
      // Ctrl-C at a prompt is a normal way to leave, not a crash.
      process.stderr.write(`  ${dim("Cancelled.")}\n\n`);
      process.exitCode = 130;
      return;
    }

    // Range flags are validated when the command runs, not at parse time, so
    // they surface here and still deserve usage-error treatment.
    if (error instanceof ArgError) {
      process.stderr.write(`\n  ${red(sym.cross)} ${error.message}\n`);
      process.stderr.write(`  ${dim("Run `tokn --help` for usage.")}\n\n`);
      process.exitCode = 2;
      return;
    }

    if (error instanceof ApiError) {
      process.stderr.write(`\n  ${red(sym.cross)} ${error.message}\n`);
      if (error.hint) process.stderr.write(`  ${dim(error.hint)}\n`);
      process.stderr.write("\n");
      process.exitCode = 1;
      return;
    }

    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`\n  ${red(sym.cross)} ${message}\n`);
    if (process.env.TOKN_DEBUG && error instanceof Error && error.stack) {
      process.stderr.write(`\n${dim(error.stack)}\n`);
    } else {
      process.stderr.write(`  ${dim("Set TOKN_DEBUG=1 for details.")}\n`);
    }
    process.stderr.write("\n");
    process.exitCode = 1;
  });

// Writing to a closed pipe (`tokn scan | head`) is not an error worth reporting.
process.stdout.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EPIPE") process.exit(0);
});
