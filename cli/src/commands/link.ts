import { ApiClient, ApiError } from "../core/api.js";
import { openBrowser } from "../core/browser.js";
import { isLinked, loadConfig, saveConfig } from "../core/config.js";
import { bold, dim, gray, green, sym, yellow } from "../ui/ansi.js";
import { ask, confirm, isValidCode, link as hyperlink, normalizeCode } from "../ui/prompt.js";
import { Spinner } from "../ui/spinner.js";
import type { ParsedArgs } from "../args.js";

/**
 * `tokn link` — connect this machine to a dashboard account.
 *
 * The dashboard issues a short code and the user pastes it here, which is the
 * reverse of an OAuth device flow but needs no local callback server and works
 * identically over SSH.
 */

export async function linkCommand(args: ParsedArgs): Promise<number> {
  const config = await loadConfig();
  const out = process.stdout;

  if (isLinked(config) && !args.flags.force) {
    const who = config.user?.handle ? `@${config.user.handle}` : "an account";
    out.write(`\n  ${yellow(sym.bullet)} This machine is already linked to ${bold(who)}.\n`);

    if (!process.stdin.isTTY) {
      out.write(`  ${dim("Pass --force to replace the existing link.")}\n\n`);
      return 1;
    }
    if (!(await confirm("Link to a different account?"))) {
      out.write(`\n  ${dim("Nothing changed.")}\n\n`);
      return 0;
    }
  }

  const linkUrl = `${config.host.replace(/\/+$/, "")}/link`;

  let code = typeof args.flags.code === "string" ? args.flags.code : "";

  if (!code) {
    out.write(`\n  ${bold("Link this machine to your tokn dashboard")}\n\n`);
    out.write(`  ${dim("1.")} Open ${hyperlink(linkUrl)}\n`);
    out.write(`  ${dim("2.")} Copy the code shown on that page\n`);
    out.write(`  ${dim("3.")} Paste it below\n\n`);

    if (process.stdin.isTTY && args.flags.browser !== false) {
      await ask(`${dim("Press Enter to open your browser")}`, "or Ctrl-C to cancel");
      openBrowser(linkUrl);
      out.write("\n");
    }

    code = await ask("Code", "xxxx-xxxx");
  }

  code = normalizeCode(code);

  if (!isValidCode(code)) {
    out.write(`\n  ${yellow(sym.cross)} That does not look like a link code.\n`);
    out.write(`  ${dim(`Codes are eight characters, like ${gray("A1B2-C3D4")}.`)}\n\n`);
    return 1;
  }

  const spinner = new Spinner().start("Verifying…");
  const client = new ApiClient(config.host);

  try {
    const { token, user } = await client.link(code);
    spinner.clearAndStop();

    await saveConfig({
      ...config,
      token,
      user,
      linkedAt: new Date().toISOString(),
    });

    const who = user.handle ? `@${user.handle}` : (user.name ?? "your account");
    out.write(`\n  ${green(sym.tick)} Linked as ${bold(who)}\n\n`);
    out.write(`  ${dim("Run")} ${bold("tokn sync")} ${dim("to publish your usage to the leaderboard.")}\n\n`);
    return 0;
  } catch (error) {
    spinner.clearAndStop();
    if (error instanceof ApiError) {
      out.write(`\n  ${yellow(sym.cross)} ${error.message}\n`);
      if (error.hint) out.write(`  ${dim(error.hint)}\n`);
      out.write("\n");
      return 1;
    }
    throw error;
  }
}

