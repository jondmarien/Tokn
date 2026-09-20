import { clearConfig, isLinked, loadConfig } from "../core/config.js";
import { bold, dim, green, sym, yellow } from "../ui/ansi.js";
import { confirm } from "../ui/prompt.js";
import type { ParsedArgs } from "../args.js";

/** `tokn unlink` — forget the stored credential on this machine. */

export async function unlinkCommand(args: ParsedArgs): Promise<number> {
  const out = process.stdout;
  const config = await loadConfig();

  if (!isLinked(config)) {
    out.write(`\n  ${dim("This machine is not linked.")}\n\n`);
    return 0;
  }

  const who = config.user?.handle ? `@${config.user.handle}` : "your account";

  if (!args.flags.yes && process.stdin.isTTY) {
    out.write(`\n  ${yellow(sym.bullet)} This will disconnect this machine from ${bold(who)}.\n`);
    out.write(`  ${dim("Usage already published to the leaderboard is not affected.")}\n\n`);
    if (!(await confirm("Continue?"))) {
      out.write(`\n  ${dim("Nothing changed.")}\n\n`);
      return 0;
    }
  }

  await clearConfig();
  out.write(`\n  ${green(sym.tick)} Unlinked from ${bold(who)}\n\n`);

  if (process.env.TOKN_TOKEN) {
    out.write(`  ${yellow(sym.bullet)} ${dim("TOKN_TOKEN is still set in your environment and will keep this machine linked.")}\n\n`);
  }

  return 0;
}
