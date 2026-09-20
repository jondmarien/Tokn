import { ApiClient, ApiError } from "../core/api.js";
import { loadConfig, resolveToken, saveConfig } from "../core/config.js";
import { toSyncRows } from "../core/aggregate.js";
import { NoSessionsError, runScan } from "../core/run-scan.js";
import { bold, dim, green, sym, yellow } from "../ui/ansi.js";
import { fullNumber, pluralize, shortModel, usd } from "../ui/format.js";
import { link as hyperlink } from "../ui/prompt.js";
import { Spinner } from "../ui/spinner.js";
import { VERSION } from "../version.js";
import { renderReport } from "./scan.js";
import { resolveSince, type ParsedArgs } from "../args.js";

/** `tokn sync` — scan, then publish the aggregates to the dashboard. */

export async function syncCommand(args: ParsedArgs): Promise<number> {
  const out = process.stdout;
  const config = await loadConfig();
  const token = resolveToken(config);

  if (!token) {
    out.write(`\n  ${yellow(sym.bullet)} This machine is not linked yet.\n\n`);
    out.write(`  ${dim("Run")} ${bold("tokn link")} ${dim("to connect it to your dashboard.")}\n\n`);
    return 1;
  }

  const client = new ApiClient(config.host, token);

  // Refresh pricing before costing anything, so a model released after this CLI
  // shipped is still priced correctly. Failing here is not fatal — the built-in
  // table remains a good fallback.
  const pricing = await refreshPricing(client, config.pricing?.models);

  // A bare `tokn sync` publishes everything. Because rows upsert on
  // (day, model), re-publishing a day corrects it rather than double-counting,
  // which is what makes a full scan the safe default.
  const since = resolveSince(args);

  let result;
  try {
    result = await runScan({ pricing, since });
  } catch (error) {
    if (error instanceof NoSessionsError) {
      out.write(`\n  ${yellow(sym.bullet)} No Claude sessions found on this machine.\n\n`);
      return 1;
    }
    throw error;
  }

  const rows = toSyncRows(result.aggregation);

  if (rows.length === 0) {
    out.write(`\n  ${yellow(sym.bullet)} Nothing to sync yet.\n\n`);
    return 0;
  }

  renderReport(result);

  if (args.flags["dry-run"]) {
    out.write(
      `\n  ${dim(`Dry run — ${fullNumber(rows.length)} ${pluralize(rows.length, "row")} would be uploaded. Nothing was sent.`)}\n\n`,
    );
    return 0;
  }

  const spinner = new Spinner().start(
    `Publishing ${fullNumber(rows.length)} ${pluralize(rows.length, "row")}…`,
  );

  try {
    const response = await client.sync({
      rows,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      scannedAt: new Date().toISOString(),
      cliVersion: VERSION,
    });
    spinner.clearAndStop();

    await saveConfig({
      ...config,
      pricing: pricing
        ? { fetchedAt: new Date().toISOString(), models: pricing }
        : config.pricing,
      lastSyncAt: new Date().toISOString(),
      lastSyncRows: rows.length,
    });

    out.write(
      `\n  ${green(sym.tick)} Published ${bold(usd(result.aggregation.totals.cost.total))} across ${bold(fullNumber(result.aggregation.totals.requests))} requests\n`,
    );

    // The server prices every row itself and drops anything it cannot make
    // sense of. Staying quiet about that would leave someone comparing their
    // local total against a smaller one on the site with nothing to go on.
    if (response.rejected && response.rejected.length > 0) {
      const n = response.rejected.length;
      out.write(
        `\n  ${yellow(sym.bullet)} The server did not store ${bold(String(n))} ` +
          `${n === 1 ? "row" : "rows"}:\n`,
      );
      for (const row of response.rejected.slice(0, 5)) {
        out.write(`    ${dim(`${row.day}  ${shortModel(row.model)}`)}  ${dim(row.detail)}\n`);
      }
      if (n > 5) out.write(`    ${dim(`… and ${n - 5} more`)}\n`);
      const unpriced = response.rejected.some((r) => r.reason === "unpriceable-model");
      if (unpriced) {
        out.write(
          `  ${dim("A model with no published rate cannot be priced. Report it and it")}\n` +
            `  ${dim("will be added.")}\n`,
        );
      }
      out.write("\n");
    }

    if (response.rank !== undefined) {
      out.write(`  ${dim(`You are ranked`)} ${bold(`#${fullNumber(response.rank)}`)} ${dim("on the leaderboard.")}\n`);
    }
    if (response.profileUrl) {
      out.write(`  ${dim("View:")} ${hyperlink(response.profileUrl)}\n`);
    }
    out.write("\n");
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

async function refreshPricing(client: ApiClient, fallback: Record<string, any> | undefined) {
  try {
    const { models } = await client.pricing();
    if (models && Object.keys(models).length > 0) return models;
  } catch {
    // Offline, or the endpoint is not deployed yet.
  }
  return fallback;
}
