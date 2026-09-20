import { bold, cyan, dim, padEnd, padStart } from "../../ui/ansi.js";
import { compactNumber, fullNumber, money, relativeTime, shortModel } from "../../ui/format.js";
import { bar, label, rule, sparkline, truncate } from "../../ui/widgets.js";
import type { SiteData } from "../types.js";

/**
 * Site-wide stats, mirroring `/stats`.
 *
 * Same 30-day window and same top-ten cut as the page, so the two can be read
 * side by side without wondering which one is stale.
 */

const TOKENS_PER_NOVEL = 120_000;
const PAD = "  ";

export function render(data: SiteData, width: number): string[] {
  const out: string[] = [];
  const inner = Math.max(30, width - 4);
  const push = (s = "") => out.push(s ? PAD + s : "");

  const { stats, top } = data;
  const { users, window: win, allTime } = stats;
  const perSecond = win.tokens / (stats.windowDays * 86_400);
  const novels = win.tokens / TOKENS_PER_NOVEL;

  push();
  push(bold("everyone, together") + dim(`   last ${stats.windowDays} days`));
  push();

  push(
    cellPair("developers", fullNumber(users.total), `${fullNumber(users.reporting)} reporting`) +
      cellPair(
        `tokens · ${stats.windowDays}d`,
        compactNumber(win.tokens),
        `≈ ${fullNumber(Math.round(novels))} novels`,
      ),
  );
  push(
    cellPair(`spend · ${stats.windowDays}d`, money(win.cost), `${money(allTime.cost)} all time`) +
      cellPair(
        `requests · ${stats.windowDays}d`,
        compactNumber(win.requests),
        `${fullNumber(users.activeInWindow)} active`,
      ),
  );
  push();
  push(dim(`${compactNumber(perSecond)} tokens a second, sustained.`));

  /* ------------------------------------------------------------ spend */

  if (stats.byDay.length > 1) {
    push();
    push(label(`spend · last ${stats.windowDays} days`));
    push();
    push(sparkline(stats.byDay.map((d) => d.cost), Math.min(inner, 72)));
    const busiest = [...stats.byDay].sort((a, b) => b.cost - a.cost)[0];
    if (busiest) {
      push(dim(`${stats.byDay[0]!.day}  →  today · busiest ${busiest.day} at ${money(busiest.cost)}`));
    }
  }

  /* ------------------------------------------------------- model mix */

  if (stats.byModel.length > 0) {
    push();
    push(label("model mix") + dim(`   ${stats.byModel.length} models`));
    push();
    for (const m of stats.byModel.slice(0, 8)) {
      push(share(shortModel(m.model), money(m.cost), m.cost, win.cost, inner));
    }
  }

  /* ----------------------------------------------------------- tools */

  push();
  push(label("tools") + dim(`   ${stats.byTool.length}`));
  push();
  if (stats.byTool.length === 0) {
    push(dim("nothing reported in this window."));
  } else {
    for (const t of stats.byTool) {
      push(
        padEnd(truncate(t.tool, 16), 16) +
          bar(win.cost > 0 ? t.cost / win.cost : 0, 20, cyan) +
          dim(padStart(money(t.cost), 12)) +
          dim(padStart(`${fullNumber(t.users)} devs`, 10)),
      );
    }
  }

  /* --------------------------------------------------------- records */

  const { biggestDay, mostRequests, mostModels } = stats.records;
  if (biggestDay || mostRequests || mostModels) {
    push();
    push(label(`records · last ${stats.windowDays} days`));
    push();
    if (biggestDay) push(record("biggest day", money(biggestDay.value), biggestDay.handle, biggestDay.detail));
    if (mostRequests) {
      push(record("most requests", compactNumber(mostRequests.value), mostRequests.handle, mostRequests.detail));
    }
    if (mostModels) {
      push(record("most models", fullNumber(mostModels.value), mostModels.handle, mostModels.detail));
    }
  }

  /* ---------------------------------------------------- top this month */

  if (top.length > 0) {
    push();
    push(label("top this month"));
    push();
    push(dim(padStart("#", 3) + "  " + padEnd("user", 20) + padStart("spend", 12) + padStart("tokens", 10)));
    for (const row of top) {
      push(
        padStart(String(row.rank), 3) +
          "  " +
          padEnd(truncate(cyan(`@${row.handle}`), 20), 20) +
          padStart(money(row.cost), 12) +
          dim(padStart(compactNumber(row.tokens), 10)),
      );
    }
  }

  /* ---------------------------------------------------- latest syncs */

  if (stats.recentSyncs.length > 0) {
    push();
    push(label("latest syncs"));
    push();
    for (const s of stats.recentSyncs) {
      push(padEnd(cyan(`@${s.handle}`), 24) + dim(relativeTime(s.at)));
    }
  }

  push();
  push(rule(inner));
  push(
    dim(
      `Since ${allTime.firstDay ?? "the beginning"}: ${compactNumber(allTime.tokens)} tokens, ` +
        `${money(allTime.cost)}.`,
    ),
  );
  push();
  return out;
}

/* ------------------------------------------------------------- helpers */

function cellPair(name: string, value: string, foot: string): string {
  return padEnd(dim(name) + "  " + bold(value) + dim(`  ${foot}`), 42);
}

function record(name: string, value: string, handle: string, detail?: string): string {
  return (
    padEnd(dim(name), 16) +
    bold(padStart(value, 11)) +
    "  " +
    cyan(`@${handle}`) +
    (detail ? dim(`  ${detail}`) : "")
  );
}

function share(name: string, value: string, part: number, total: number, inner: number): string {
  const width = Math.max(8, Math.min(inner - 44, 24));
  const fraction = total > 0 ? part / total : 0;
  return (
    padEnd(truncate(name, 16), 16) +
    bar(fraction, width, cyan) +
    dim(padStart(value, 12)) +
    dim(padStart(`${(fraction * 100).toFixed(1)}%`, 8))
  );
}
