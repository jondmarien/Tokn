import { loadConfig } from "../core/config.js";
import {
  checkForUpdate,
  declineUpdate,
  fetchRelease,
  installKind,
  performUpdate,
  UpdateError,
  type UpdateInfo,
} from "../core/update.js";
import { VERSION } from "../version.js";
import { bold, dim, green, red, sym, yellow } from "../ui/ansi.js";
import { confirm } from "../ui/prompt.js";
import { Spinner } from "../ui/spinner.js";
import type { ParsedArgs } from "../args.js";

/**
 * `tokn update` — fetch the newest published version and install it.
 *
 * Also the second half of the passive notice: when a command ends and finds
 * something newer, it offers, and an accepted offer lands here. One code path
 * either way, so the prompt cannot drift from what the explicit command does.
 */

export async function updateCommand(args: ParsedArgs): Promise<number> {
  const out = process.stdout;
  const config = await loadConfig();

  const spinner = new Spinner().start("Checking for updates…");
  const info = await checkForUpdate(config, { force: true });
  spinner.clearAndStop();

  if (!info) {
    out.write(`\n  ${green(sym.tick)} ${bold(`tokn ${VERSION}`)} ${dim("is the latest version.")}\n\n`);
    return 0;
  }

  out.write(
    `\n  ${yellow(sym.bullet)} ${bold(`tokn ${info.latest}`)} ${dim(`is available. You have ${VERSION}.`)}\n\n`,
  );

  if (!args.flags.yes && process.stdin.isTTY) {
    if (!(await confirm("Update now?", true))) {
      await declineUpdate(info.latest);
      out.write(`\n  ${dim("Left alone. Run tokn update when you are ready.")}\n\n`);
      return 0;
    }
  }

  return runUpdate(info);
}

/**
 * Do the update, with a bar.
 *
 * The percentage is the download, because the download is the only part with a
 * real denominator: the registry sends a content-length and the bytes arrive
 * against it. Verifying and installing are shown as what they are rather than
 * being given invented shares of a total, which is the difference between a
 * progress bar and a decoration.
 */
export async function runUpdate(info: UpdateInfo): Promise<number> {
  const out = process.stdout;
  const spinner = new Spinner().start("Starting…");

  try {
    // Resolved here rather than carried through the notice, so the tarball URL
    // and its digest are always the ones the registry is serving right now
    // rather than whatever was cached a day ago.
    const release = await fetchRelease(10_000);
    if (!release) {
      throw new UpdateError(
        "could not reach the npm registry",
        "Check your connection and try again.",
      );
    }

    await performUpdate(release, (progress) => {
      if (progress.phase === "downloading") {
        if (progress.fraction === undefined) {
          // No content-length: say so rather than invent a denominator.
          spinner.update("Downloading…");
          return;
        }
        const size = progress.total ? ` ${mb(progress.received ?? 0)}/${mb(progress.total)}` : "";
        spinner.progress("Downloading", progress.fraction, size.trim());
        return;
      }
      if (progress.phase === "verifying") spinner.update("Verifying checksum…");
      if (progress.phase === "installing") spinner.update("Installing…");
    });

    spinner.succeed(`Updated to ${bold(`tokn ${info.latest}`)}`);
    out.write(`  ${dim("The next command you run uses the new version.")}\n\n`);
    return 0;
  } catch (error) {
    spinner.clearAndStop();

    if (error instanceof UpdateError) {
      out.write(`\n  ${red(sym.cross)} ${error.message}\n`);
      if (error.hint) out.write(`  ${dim(error.hint)}\n`);
      // Whatever went wrong, the manual route always works.
      if (installKind() === "npm-global") {
        out.write(`\n  ${dim("You can always update by hand:")}\n`);
        out.write(`    ${dim("npm install -g toknhq@latest")}\n`);
      }
      out.write("\n");
      return 1;
    }
    throw error;
  }
}

function mb(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)}MB`
    : `${Math.max(1, Math.round(bytes / 1024))}KB`;
}

/**
 * The passive notice, printed after a command has already done its work.
 *
 * Deliberately last. A version check that delays the thing somebody typed is
 * worse than a version check that never happens, so this runs on the way out
 * and stays silent about every failure.
 */
export async function offerUpdate(args: ParsedArgs): Promise<void> {
  // Machine-readable output, pipes and unattended runs get nothing: a prompt
  // in a cron job hangs it, and a notice in `--json` corrupts the document.
  if (args.flags.json) return;
  if (!process.stdout.isTTY || !process.stdin.isTTY) return;
  if (process.env.TOKN_NO_UPDATE_CHECK) return;
  if (installKind() !== "npm-global") return;

  try {
    const config = await loadConfig();
    const info = await checkForUpdate(config);
    if (!info) return;

    const out = process.stdout;
    out.write(
      `  ${yellow(sym.bullet)} ${dim("Update available:")} ${bold(info.latest)} ${dim(`(you have ${VERSION})`)}\n`,
    );

    if (!(await confirm("Update now?", false))) {
      await declineUpdate(info.latest);
      out.write(`  ${dim("Fine. Run tokn update whenever you like.")}\n\n`);
      return;
    }

    await runUpdate(info);
  } catch {
    // A failed check, a failed prompt, a closed pipe: none of it is worth
    // turning a successful command into a failed one.
  }
}
