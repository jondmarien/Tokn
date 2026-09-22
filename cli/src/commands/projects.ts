import path from "node:path";
import os from "node:os";
import { runScan, NoSessionsError } from "../core/run-scan.js";
import { loadConfig } from "../core/config.js";
import { aggregate } from "../core/aggregate.js";
import { totalTokens } from "../core/pricing.js";
import { bold, dim } from "../ui/ansi.js";
import { compactNumber, fullNumber, money2, pluralize, relativeTime } from "../ui/format.js";
import { renderTable } from "../ui/table.js";
import { resolveSince, type ParsedArgs } from "../args.js";
import type { UsageEvent } from "../core/sources/types.js";

/**
 * `tokn projects` — what each repository cost.
 *
 * The one thing this tool can do that no server-side product can. Every usage
 * record Claude Code writes carries the `cwd` it happened in, so spend is
 * already attributable per repository; it was simply being discarded at the
 * parser. For anyone billing a client, "what did this project cost me" is the
 * question with money attached to it.
 *
 * ## Pricing is not reimplemented here
 *
 * Events are grouped by project and each group is handed to the same
 * `aggregate()` the scan and sync use. Writing a second cost calculation for
 * this view would work on the day it was written and drift the first time a
 * rate multiplier changed, and then two screens in one tool would disagree
 * about the same money.
 *
 * ## None of this leaves the machine
 *
 * An absolute path names the client you are working for. `aggregate()`
 * collapses events into (day, tool, model) buckets before a sync, so project
 * paths cannot reach the server through the upload path, and this command does
 * its grouping locally without asking the API for anything.
 */

interface Row {
  project: string;
  costUsd: number;
  tokens: number;
  requests: number;
  days: number;
  branches: string[];
  sessions: number;
  lastAt: string;
}

/**
 * A readable name for a path, made unique only as far as it has to be.
 *
 * The basename is what anyone calls their project, but two checkouts named
 * `web` under different parents would collide and silently merge two clients'
 * spend into one row. Colliding names take one more segment of parent,
 * repeatedly, until every name is distinct.
 */
function shortNames(paths: string[]): Map<string, string> {
  const depth = new Map<string, number>(paths.map((p) => [p, 1]));

  for (let round = 0; round < 6; round++) {
    const byName = new Map<string, string[]>();
    for (const full of paths) {
      const name = tail(full, depth.get(full) ?? 1);
      byName.set(name, [...(byName.get(name) ?? []), full]);
    }
    const clashes = [...byName.values()].filter((group) => group.length > 1);
    if (clashes.length === 0) break;
    for (const group of clashes) {
      for (const full of group) depth.set(full, (depth.get(full) ?? 1) + 1);
    }
  }

  return new Map(paths.map((p) => [p, tail(p, depth.get(p) ?? 1)]));
}

function tail(full: string, segments: number): string {
  const parts = full.split(path.sep).filter(Boolean);
  return parts.slice(Math.max(0, parts.length - segments)).join(path.sep);
}

export async function projectsCommand(args: ParsedArgs): Promise<number> {
  const out = process.stdout;
  const config = await loadConfig();
  const pricing = config.pricing?.models;
  const asJson = args.flags.json === true;

  let events: UsageEvent[];
  try {
    const scan = await runScan({
      since: resolveSince(args),
      pricing,
      quiet: asJson,
      keepEvents: true,
    });
    events = scan.events ?? [];
  } catch (error) {
    if (error instanceof NoSessionsError) {
      out.write(`\n  ${dim("No AI CLI sessions found on this machine.")}\n\n`);
      return 1;
    }
    throw error;
  }

  /* --------------------------------------------- group, then reuse pricing */

  const groups = new Map<string, UsageEvent[]>();
  let unattributed = 0;

  for (const event of events) {
    // Only Claude Code records a working directory today. Everything else is
    // counted aside rather than filed under a guess.
    if (!event.project) {
      unattributed++;
      continue;
    }
    const list = groups.get(event.project);
    if (list) list.push(event);
    else groups.set(event.project, [event]);
  }

  const rows: Row[] = [];
  for (const [project, group] of groups) {
    const summary = aggregate(group, pricing);
    const branches = new Set<string>();
    const sessions = new Set<string>();
    let lastAt = group[0]?.timestamp ?? "";
    for (const event of group) {
      if (event.branch) branches.add(event.branch);
      if (event.session) sessions.add(event.session);
      if (event.timestamp > lastAt) lastAt = event.timestamp;
    }
    rows.push({
      project,
      costUsd: summary.totals.cost.total,
      tokens: totalTokens(summary.totals.tokens),
      requests: summary.totals.requests,
      days: summary.byDay.length,
      branches: [...branches].sort(),
      sessions: sessions.size,
      lastAt,
    });
  }

  rows.sort((a, b) => b.costUsd - a.costUsd);
  const names = shortNames(rows.map((r) => r.project));

  /* -------------------------------------------------------------- output */

  if (asJson) {
    out.write(
      JSON.stringify(
        {
          projects: rows.map((r) => ({
            name: names.get(r.project),
            path: r.project,
            costUsd: Number(r.costUsd.toFixed(6)),
            tokens: r.tokens,
            requests: r.requests,
            activeDays: r.days,
            branches: r.branches,
            sessions: r.sessions,
            lastAt: r.lastAt,
          })),
          unattributedRequests: unattributed,
        },
        null,
        2,
      ) + "\n",
    );
    return 0;
  }

  if (rows.length === 0) {
    out.write(`\n  ${dim("No per-project data on this machine.")}\n`);
    out.write(
      `  ${dim("Only Claude Code records a working directory, so other tools cannot be split up.")}\n\n`,
    );
    return 0;
  }

  const total = rows.reduce((sum, r) => sum + r.costUsd, 0);
  const home = os.homedir();

  out.write(`\n  ${bold("Spend by project")}\n`);
  out.write(`  ${dim("Read locally. Project paths are never uploaded.")}\n\n`);

  const table = rows.map((r) => [
    names.get(r.project) ?? r.project,
    money2(r.costUsd),
    // A share is what makes one row mean something next to the others.
    total > 0 ? `${((r.costUsd / total) * 100).toFixed(0)}%` : "—",
    compactNumber(r.tokens),
    fullNumber(r.requests),
    String(r.days),
    relativeTime(r.lastAt),
  ]);

  table.push([
    dim("TOTAL"),
    dim(money2(total)),
    "",
    dim(compactNumber(rows.reduce((s, r) => s + r.tokens, 0))),
    dim(fullNumber(rows.reduce((s, r) => s + r.requests, 0))),
    "",
    "",
  ]);

  out.write(
    renderTable(
      [
        { header: "project" },
        { header: "cost", align: "right" },
        { header: "share", align: "right" },
        { header: "tokens", align: "right" },
        { header: "requests", align: "right" },
        { header: "days", align: "right" },
        { header: "last", align: "right" },
      ],
      table,
      { ruleBeforeLast: true },
    ),
  );

  if (args.flags.paths) {
    out.write(`\n  ${dim("Full paths")}\n`);
    for (const row of rows) {
      const shown = row.project.startsWith(home)
        ? "~" + row.project.slice(home.length)
        : row.project;
      out.write(`    ${dim((names.get(row.project) ?? "") + "  " + shown)}\n`);
    }
  }

  if (unattributed > 0) {
    out.write(
      `\n  ${dim(`${fullNumber(unattributed)} ${pluralize(unattributed, "request")} from tools that record no directory.`)}\n`,
    );
  }

  out.write(
    `\n  ${dim("--paths for full directories, --json for machine-readable output.")}\n\n`,
  );

  return 0;
}
