import os from "node:os";
import path from "node:path";
import { ApiClient, ApiError } from "../core/api.js";
import { configPath, loadConfig, resolveToken } from "../core/config.js";
import { bold, dim, green, gray, sym, yellow } from "../ui/ansi.js";
import { fullNumber, pluralize, relativeTime } from "../ui/format.js";
import { Spinner } from "../ui/spinner.js";
import type { ParsedArgs } from "../args.js";

/** `tokn status` — where this machine points and whether the link still works. */

export async function statusCommand(args: ParsedArgs): Promise<number> {
  const out = process.stdout;
  const config = await loadConfig();
  const token = resolveToken(config);

  out.write(`\n  ${bold(displayHost(config.host))}\n`);

  if (!token) {
    out.write(`    ${yellow(sym.cross)} Not linked\n\n`);
    out.write(`    ${dim("Run")} ${bold("tokn link")} ${dim("to connect this machine.")}\n\n`);
    return 1;
  }

  const stored = config.user?.handle ? `@${config.user.handle}` : "an account";
  const fromEnv = Boolean(process.env.TOKN_TOKEN);

  // Offline mode still reports what we know locally rather than failing.
  if (args.flags.offline) {
    out.write(`    ${green(sym.tick)} Linked as ${bold(stored)} ${dim("(not verified)")}\n`);
    writeLocalFacts(config, fromEnv);
    return 0;
  }

  const spinner = new Spinner().start("Checking link…");
  try {
    const { user } = await new ApiClient(config.host, token).me();
    spinner.clearAndStop();
    const who = user.handle ? `@${user.handle}` : (user.name ?? "your account");
    out.write(`    ${green(sym.tick)} Linked as ${bold(who)}\n`);
    writeLocalFacts(config, fromEnv);
    return 0;
  } catch (error) {
    spinner.clearAndStop();

    if (error instanceof ApiError && error.status === 401) {
      out.write(`    ${yellow(sym.cross)} Link rejected — the token is no longer valid\n`);
      out.write(`\n    ${dim("Run")} ${bold("tokn link")} ${dim("to reconnect.")}\n\n`);
      return 1;
    }

    // A network problem says nothing about whether the link is good.
    out.write(`    ${green(sym.tick)} Linked as ${bold(stored)} ${dim("(could not reach dashboard)")}\n`);
    if (error instanceof ApiError) out.write(`    ${dim(error.message)}\n`);
    writeLocalFacts(config, fromEnv);
    return 0;
  }
}

function writeLocalFacts(
  config: Awaited<ReturnType<typeof loadConfig>>,
  fromEnv: boolean,
): void {
  const out = process.stdout;

  out.write(
    fromEnv
      ? `    ${green(sym.tick)} Token from ${gray("TOKN_TOKEN")}\n`
      : `    ${green(sym.tick)} Token stored in ${gray(tildify(configPath()))}\n`,
  );

  if (config.lastSyncAt) {
    const rows = config.lastSyncRows;
    const detail = rows ? ` ${dim(`(${fullNumber(rows)} ${pluralize(rows, "row")})`)}` : "";
    out.write(`    ${dim("Last sync:")} ${relativeTime(config.lastSyncAt)}${detail}\n`);
  } else {
    out.write(`    ${dim("Last sync:")} never ${dim("— run")} ${bold("tokn sync")}\n`);
  }

  out.write("\n");
}

function displayHost(host: string): string {
  try {
    return new URL(host).host;
  } catch {
    return host;
  }
}

function tildify(p: string): string {
  const home = os.homedir();
  return p.startsWith(home) ? path.join("~", p.slice(home.length)) : p;
}
