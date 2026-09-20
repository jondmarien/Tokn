import { spawn } from "node:child_process";
import { ApiClient, ApiError } from "../core/api.js";
import { loadConfig, resolveToken, saveConfig } from "../core/config.js";
import { runScan, NoSessionsError } from "../core/run-scan.js";
import { totalTokens } from "../core/pricing.js";
import { toSyncRows } from "../core/aggregate.js";
import { unreadable } from "../core/sources/registry.js";
import { DEFAULT_INTERVAL_MINUTES, DAILY_HOUR, DAILY_MINUTE } from "../core/scheduler.js";
import { bold, dim, gray, green, sym, yellow } from "../ui/ansi.js";
import { compactNumber, fullNumber, pluralize, usd } from "../ui/format.js";
import { renderLogo } from "../ui/logo.js";
import { ask, isValidCode, link as hyperlink, normalizeCode, PromptCancelledError } from "../ui/prompt.js";
import { select, confirmChoice } from "../ui/select.js";
import { Spinner } from "../ui/spinner.js";
import { autosyncCommand } from "./autosync.js";
import type { ParsedArgs } from "../args.js";

/**
 * `tokn setup` — first run. Two decisions, in this order:
 *
 *   1. link this machine to an account
 *   2. decide whether it uploads on its own
 *
 * The scan that comes before them is not a step, because it asks for nothing:
 * it reads what is already on disk and shows the numbers, so the first thing
 * anyone sees is what the tool found rather than a request for an account.
 * Nobody should have to sign up to learn whether this works.
 *
 * Both steps are numbered on screen. A wizard that does not say how much is
 * left reads as open-ended, and people abandon open-ended.
 *
 * Every step can be declined, and declining is a complete, working outcome —
 * local-only is a real way to use this, not a failure to finish setting up.
 */

const STEPS = 2;

/** A numbered step header, so the flow reads as finite. */
function step(n: number, title: string): string {
  return `\n  ${gray(`step ${n} of ${STEPS}`)}  ${bold(title)}\n`;
}

export async function setupCommand(args: ParsedArgs): Promise<number> {
  const out = process.stdout;
  const config = await loadConfig();

  out.write("\n" + renderLogo({ size: "large", subtitle: "track your AI coding usage" }) + "\n");

  /* ------------------------------------------------------ 1. what is here */

  const spinner = new Spinner().start("Looking for AI tools…");
  let result;
  try {
    result = await runScan({ pricing: config.pricing?.models, quiet: true });
    spinner.clearAndStop();
  } catch (error) {
    spinner.clearAndStop();
    if (error instanceof NoSessionsError) {
      out.write(`\n  ${yellow(sym.bullet)} No AI sessions found on this machine.\n\n`);
      out.write(`  ${dim("tokn reads what Claude Code, Claude Desktop, Codex,")}\n`);
      out.write(`  ${dim("GitHub Copilot CLI and opencode already write to disk.")}\n`);
      out.write(`  ${dim("Come back once you have used one of them.")}\n\n`);
      return 1;
    }
    throw error;
  }

  const tracked = result.sources.filter((s) => s.availability.state === "ready");
  const { aggregation } = result;

  out.write(`\n  ${green(sym.tick)} Found ${bold(String(tracked.length))} tool${tracked.length === 1 ? "" : "s"}\n\n`);
  for (const source of tracked) {
    // The Claude adapter reports two surfaces (`claude-code`, `claude-desktop`),
    // so a row's spend is the sum of every tool id it produced.
    const spend = aggregation.byTool
      .filter((t) => t.tool === source.source.id || t.tool.startsWith(`${source.source.id}-`))
      .reduce((sum, t) => sum + t.cost.total, 0);
    out.write(
      `    ${dim(sym.bullet)} ${sourceLabel(source.source).padEnd(22)} ${dim(source.stats.detail ?? "")}` +
        (spend > 0 ? ` ${gray(usd(spend))}` : "") +
        "\n",
    );
  }

  const blocked = unreadable(result.sources);
  if (blocked.length > 0) {
    out.write(`\n  ${dim("Detected but not countable:")}\n`);
    for (const tool of blocked) out.write(`    ${dim(`${tool.name} — ${tool.reason}`)}\n`);
  }

  out.write(
    `\n  ${bold(usd(aggregation.totals.cost.total))} ` +
      dim(
        `across ${compactNumber(totalTokens(aggregation.totals.tokens))} tokens, ` +
          `${fullNumber(aggregation.totals.requests)} requests, ${aggregation.byDay.length} days`,
      ) +
      "\n",
  );
  out.write(`  ${dim("All of that was read locally. Nothing has been sent anywhere.")}\n`);

  /* ------------------------------------------------------------- 2. link */

  const alreadyLinked = Boolean(resolveToken(config));

  if (!process.stdin.isTTY) {
    out.write(`\n  ${dim("Not a terminal; stopping here. Run `tokn setup` interactively.")}\n\n`);
    return 0;
  }

  try {
    out.write(step(1, "link this machine"));

    if (!alreadyLinked) {
      out.write(
        `  ${dim("Linking connects this machine to an account so your")}\n` +
          `  ${dim("numbers can appear on the leaderboard.")}\n`,
      );

      const wantsLink = await confirmChoice("Publish these numbers to the leaderboard?", {
        yes: "yes, link this machine",
        no: "not now, keep it local",
      });

      if (!wantsLink) {
        // Declining is a finished setup, not an abandoned one. Say so plainly
        // rather than leaving someone feeling they stopped halfway.
        out.write(`\n  ${green(sym.tick)} ${dim("Set up for local use. Nothing was sent.")}\n\n`);
        out.write(`  ${gray("tokn")}        ${dim("your usage, any time")}\n`);
        out.write(`  ${gray("tokn setup")}  ${dim("picks up here if you change your mind")}\n\n`);
        return 0;
      }

      const linked = await runLink(config.host);
      if (!linked) return 1;
    } else {
      out.write(
        `  ${green(sym.tick)} Already linked as ${bold(`@${config.user?.handle ?? "your account"}`)}\n`,
      );
    }

    /* ------------------------------------------------- 3. how it publishes */

    out.write(step(2, "keep it up to date"));
    out.write(
      `  ${dim("tokn can upload new usage on its own, so the board stays")}\n` +
        `  ${dim("current without you remembering to run anything.")}\n`,
    );

    const mode = await select<"auto" | "sessions" | "manual">(
      "Run in the background and upload automatically?",
      [
        {
          value: "auto",
          label: "yes, run in the background",
          hint: `every ${DEFAULT_INTERVAL_MINUTES}m + a daily close at ${clock()}`,
        },
        {
          value: "sessions",
          label: "only when a Claude Code session starts or ends",
          hint: "no background scheduler",
        },
        { value: "manual", label: "no, only when I run `tokn sync`", hint: "nothing automatic" },
      ],
    );

    let interval = DEFAULT_INTERVAL_MINUTES;

    if (mode === "auto") {
      interval = await select<number>("How often?", [
        { value: 60, label: "every hour" },
        { value: 90, label: "every 90 minutes", hint: "recommended" },
        { value: 120, label: "every 2 hours" },
        { value: 360, label: "every 6 hours", hint: "lightest" },
      ], { initial: 1 });
    }

    /* ----------------------------------------------------------- 4. apply */

    if (mode === "manual") {
      await autosyncCommand({ command: "autosync", positionals: ["off"], flags: {} });
    } else {
      // `on` installs the Claude Code hook and, unless we strip it, the OS
      // scheduler. "sessions" wants the hook only.
      await autosyncCommand({
        command: "autosync",
        positionals: ["on"],
        flags: mode === "auto" ? { every: String(interval) } : { schedule: false },
      });
    }

    /* ------------------------------------------------------ 5. first sync */

    const fresh = await loadConfig();
    const token = resolveToken(fresh);

    if (token) {
      // "Publish your history" was the old wording, and it read as though the
      // CLI were about to upload conversations. It never was — a row is a day,
      // a tool, a model and some counts — so the fix is to say what is in the
      // upload rather than to find a gentler word for it. Anyone who wants the
      // literal payload can see it with `tokn sync --dry-run`.
      const rows = toSyncRows(aggregation);

      // The envelope carries a time zone and the CLI version alongside the
      // rows. Listing only the rows would be true but incomplete, and someone
      // who later ran --dry-run and found an unmentioned field would be right
      // to trust the rest of this less.
      out.write(`\n  ${dim("Sends")}      ${dim("one line per day, per model:")}\n`);
      out.write(`             ${dim("how many requests, how many tokens, what it cost")}\n`);
      out.write(`             ${dim("your time zone and tokn's version, so days line up")}\n`);
      out.write(`  ${dim("Never")}      ${dim("your prompts, your code, file paths or project names")}\n\n`);
      out.write(`  ${gray("tokn sync --dry-run")} ${dim("prints the exact payload first.")}\n`);

      const publish = await confirmChoice(
        `Send ${fullNumber(rows.length)} ${pluralize(rows.length, "daily total")} now?`,
        {
          yes: "yes, add them to the leaderboard",
          no: "not yet",
        },
      );

      if (publish) {
        const sync = new Spinner().start("Publishing…");
        try {
          const response = await new ApiClient(fresh.host, token).sync({
            rows,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            scannedAt: new Date().toISOString(),
            cliVersion: (await import("../version.js")).VERSION,
          });
          sync.clearAndStop();

          await saveConfig({
            ...fresh,
            lastSyncAt: new Date().toISOString(),
            lastSyncRows: response.accepted,
          });

          out.write(`\n  ${green(sym.tick)} Published ${bold(usd(aggregation.totals.cost.total))}\n`);
          if (response.rank !== undefined) {
            out.write(`  ${dim("You are ranked")} ${bold(`#${response.rank}`)} ${dim("on the leaderboard.")}\n`);
          }
          if (response.profileUrl) {
            out.write(`  ${hyperlink(response.profileUrl)}\n`);
          }
        } catch (error) {
          sync.clearAndStop();
          if (error instanceof ApiError) {
            out.write(`\n  ${yellow(sym.cross)} ${error.message}\n`);
            out.write(`  ${dim("Run")} ${gray("tokn sync")} ${dim("to try again.")}\n`);
          } else throw error;
        }
      }
    }

    out.write(`\n  ${dim("You are set up.")} ${gray("tokn")} ${dim("shows your dashboard any time.")}\n\n`);
    return 0;
  } catch (error) {
    if (error instanceof PromptCancelledError) {
      out.write(`\n  ${dim("Stopped. Nothing was changed.")}\n\n`);
      return 130;
    }
    throw error;
  }
}

/** Claude's adapter covers the terminal and the desktop app. Say so. */
function sourceLabel(source: { id: string; name: string }): string {
  return source.id === "claude" ? "Claude Code + Desktop" : source.name;
}

function clock(): string {
  return `${String(DAILY_HOUR).padStart(2, "0")}:${String(DAILY_MINUTE).padStart(2, "0")}`;
}

/** The link step, inline so setup reads as one flow rather than a handoff. */
async function runLink(host: string): Promise<boolean> {
  const out = process.stdout;
  const linkUrl = `${host.replace(/\/+$/, "")}/link`;

  out.write(`\n  ${dim("1.")} Open ${hyperlink(linkUrl)}\n`);
  out.write(`  ${dim("2.")} Copy the code shown there\n\n`);

  const open = await confirmChoice("Open it in your browser?", { yes: "yes", no: "I will open it myself" });
  if (open) openBrowser(linkUrl);

  for (let attempt = 0; attempt < 3; attempt++) {
    const code = normalizeCode(await ask("Code", "xxxx-xxxx"));

    if (!isValidCode(code)) {
      out.write(`  ${yellow(sym.cross)} ${dim(`Codes look like ${gray("A1B2-C3D4")}.`)}\n`);
      continue;
    }

    const spinner = new Spinner().start("Verifying…");
    try {
      const config = await loadConfig();
      const { token, user } = await new ApiClient(config.host).link(code);
      spinner.clearAndStop();

      await saveConfig({ ...config, token, user, linkedAt: new Date().toISOString() });
      out.write(`\n  ${green(sym.tick)} Linked as ${bold(`@${user.handle}`)}\n`);
      return true;
    } catch (error) {
      spinner.clearAndStop();
      if (error instanceof ApiError) {
        out.write(`  ${yellow(sym.cross)} ${error.message}\n`);
        continue;
      }
      throw error;
    }
  }

  out.write(`\n  ${dim("Giving up on the code for now. Run")} ${gray("tokn link")} ${dim("when ready.")}\n\n`);
  return false;
}

function openBrowser(url: string): void {
  const command =
    process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  try {
    const child = spawn(command, [url], {
      stdio: "ignore",
      detached: true,
      shell: process.platform === "win32",
    });
    child.on("error", () => {});
    child.unref();
  } catch {
    // Headless; the printed URL still works.
  }
}
