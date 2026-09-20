import { ApiClient, ApiError } from "../core/api.js";
import { loadConfig, resolveToken } from "../core/config.js";
import { bold, dim, red, sym, yellow } from "../ui/ansi.js";
import { renderLogo } from "../ui/logo.js";
import { NotATtyError, run } from "../ui/screen.js";
import { Dashboard } from "../tui/app.js";
import type { ParsedArgs } from "../args.js";

/**
 * `tokn dashboard` — the website, in the terminal.
 *
 * Read-only by construction: the four endpoints it talks to are all GET, and
 * there is no code path here that can change an account. Everything editable
 * on the site — handle, profile, friends, settings — stays on the site.
 *
 * This is the one command that needs both a link and a network, so it checks
 * for them up front and says which is missing. Dropping someone into a
 * full-screen app that immediately shows an error is worse than not opening it.
 */

export async function browseCommand(args: ParsedArgs): Promise<number> {
  const err = process.stderr;

  // Checked before anything else, including the config read and the first
  // fetch. There is no point asking the network a question whose answer can
  // only be drawn on a screen we do not have.
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    err.write(`\n  ${red(sym.cross)} ${bold("tokn dashboard")} needs an interactive terminal.\n\n`);
    err.write(`  ${dim("It draws a full-screen interface, so it cannot run when")}\n`);
    err.write(`  ${dim("output is piped or redirected.")}\n\n`);
    err.write(`  ${dim("For something pipeable, try")} ${bold("tokn scan --json")}${dim(".")}\n\n`);
    return 1;
  }

  const config = await loadConfig();
  const token = resolveToken(config);
  const host = config.host;

  if (!token) {
    err.write("\n" + renderLogo() + "\n\n");
    err.write(`  ${yellow(sym.bullet)} This machine is not linked yet.\n\n`);
    err.write(`  ${dim("The dashboard shows your account on the leaderboard,")}\n`);
    err.write(`  ${dim("so it needs to know which account that is.")}\n\n`);
    err.write(`  ${dim("Run")} ${bold("tokn link")} ${dim("to connect it.")}\n\n`);
    return 1;
  }

  const api = new ApiClient(host, token);
  const handle = config.user?.handle ?? "you";
  const app = new Dashboard(api, host, handle);

  try {
    // One fetch before taking over the screen. If the token has been revoked
    // or the site is down, that should be an ordinary error message in the
    // user's scrollback, not a full-screen app that flashes up and dies.
    await app.prefetch();
  } catch (error) {
    return report(error, host);
  }

  try {
    return await run(app);
  } catch (error) {
    if (error instanceof NotATtyError) {
      // Only reachable if the terminal went away after the check above.
      err.write(`\n  ${red(sym.cross)} lost the terminal before the dashboard could start.\n\n`);
      return 1;
    }
    return report(error, host);
  }
}

function report(error: unknown, host: string): number {
  const err = process.stderr;
  if (error instanceof ApiError) {
    err.write(`\n  ${red(sym.cross)} ${error.message}\n`);
    if (error.hint) err.write(`  ${dim(error.hint)}\n`);
    err.write("\n");
    return 1;
  }
  err.write(`\n  ${red(sym.cross)} Could not load the dashboard from ${host}\n`);
  err.write(`  ${dim((error as Error).message)}\n\n`);
  return 1;
}
