import { bold, cyan, dim, gray, green, padEnd, padStart, yellow } from "../../ui/ansi.js";
import {
  anatomyUsd,
  compactNumber,
  fullNumber,
  money2,
  relativeTime,
  shortModel,
} from "../../ui/format.js";
import { renderHeatmap, renderHeatmapLegend } from "../../ui/heatmap.js";
import { bar, label, rule, sparkline, stackedBar, truncate } from "../../ui/widgets.js";
import type { ProfileData } from "../types.js";

/**
 * One profile, mirroring the website's page section for section.
 *
 * The ordering is the site's ordering — identity, headline stats, activity,
 * spend, tokens, models, tools, summary, then the cost anatomy — because the
 * two are meant to be the same page. Where the site hides a block for want of
 * data, this hides it on the same condition: the reuse comparison needs a
 * cohort, the projection needs enough days, and a saving is only ever named
 * when there is one to name. Inventing a number the web page would have
 * withheld is the one way a mirror like this can lie.
 */

const PAD = "  ";

export function render(data: ProfileData, width: number): string[] {
  const out: string[] = [];
  const inner = Math.max(30, width - 4);
  const push = (s = "") => out.push(s ? PAD + s : "");

  const { user, stats, anatomy, benchmark, burn, whatIf } = data;
  const hasUsage = stats.totals.requests > 0;

  /* -------------------------------------------------------- identity */

  push();
  const tags: string[] = [];
  if (user.billing === "subscription") tags.push(dim("plan"));
  if (data.rank !== null) tags.push(yellow(`#${data.rank}`));
  if (user.own && !user.isPublic) tags.push(dim("private"));
  if (user.own && user.isPublic && !user.listed) tags.push(dim("unlisted"));
  if (!user.own && user.friend) tags.push(green("friend"));

  push(bold(user.name || user.handle) + (tags.length ? "  " + tags.join(dim(" · ")) : ""));
  push(cyan(`@${user.handle}`) + dim(`  joined ${sinceDay(user.createdAt)}`));

  if (user.links.length > 0) {
    push(dim(user.links.map((l) => l.label ?? l.url.replace(/^https?:\/\//, "")).join("  ")));
  }
  if (user.bio) push(dim(truncate(user.bio, inner)));

  /* -------------------------------------------------- headline stats */

  push();
  push(
    cell("spend", money2(stats.totals.cost)) +
      cell("tokens", compactNumber(stats.totals.tokens)) +
      cell("requests", fullNumber(stats.totals.requests)) +
      cell("active days", fullNumber(stats.totals.days)),
  );

  if (!hasUsage) {
    push();
    push(
      dim(
        user.own
          ? "nothing reported yet — connect a machine and run `tokn sync`."
          : "this account has not reported any usage yet.",
      ),
    );
    if (user.plans.length > 0) out.push(...plansBlock(data, inner));
    return out;
  }

  push();
  push(
    dim(
      `${stats.streak}d streak · longest ${stats.longestStreak}d · ` +
        `${stats.byModel.length} models · ${stats.byTool.length} tools`,
    ),
  );

  /* -------------------------------------------------------- activity */

  push();
  push(label("activity"));
  push();
  // The website feeds the heatmap every day it has, not the 90-day slice it
  // uses for the spend chart, so this does too.
  const heat = renderHeatmap(
    stats.byDay.map((d) => ({ day: d.day, value: d.cost })),
    { width: inner },
  );
  for (const row of heat.split("\n")) push(row);
  push(renderHeatmapLegend());

  /* ----------------------------------------------------------- spend */

  const recent = stats.byDay.slice(-90);
  if (recent.length > 1) {
    push();
    push(label("spend") + dim(`   ${recent[0]!.day} → today`));
    push();
    push(sparkline(recent.map((d) => d.cost), Math.min(inner, 72)));
    const best = stats.best;
    if (best) push(dim(`biggest day ${money2(best.cost)} on ${best.day}`));
  }

  /* ---------------------------------------------------------- tokens */

  push();
  push(label("tokens") + dim(`   ${compactNumber(stats.totals.tokens)} total`));
  push();

  // Tokens per day, on the same 90-day window as the spend line above, so the
  // two can be read against each other: a day that cost more without moving
  // this line means the mix changed, not the volume.
  if (recent.length > 1) {
    push(sparkline(recent.map((d) => d.tokens), Math.min(inner, 72)));
    const peak = recent.reduce((top, d) => (d.tokens > top.tokens ? d : top), recent[0]!);
    push(
      dim(
        `${recent[0]!.day} → today · busiest ${peak.day} at ${compactNumber(peak.tokens)}`,
      ),
    );
    push();
  }

  const tokenRows: [string, number][] = [
    ["cache read", stats.tokens.cacheRead],
    ["cache write", stats.tokens.cacheWrite],
    ["output", stats.tokens.output],
    ["input", stats.tokens.input],
  ];
  for (const [name, value] of tokenRows) {
    push(share(name, compactNumber(value), value, stats.totals.tokens, inner));
  }

  /* ---------------------------------------------------------- models */

  push();
  push(label("models") + dim(`   ${stats.byModel.length}`));
  push();
  for (const m of stats.byModel.slice(0, 8)) {
    push(share(shortModel(m.model), money2(m.cost), m.cost, stats.totals.cost, inner));
  }

  /* ----------------------------------------------------------- tools */

  push();
  push(label("tools") + dim(`   ${stats.byTool.length}`));
  push();
  for (const t of stats.byTool) {
    push(share(t.tool, money2(t.cost), t.cost, stats.totals.cost, inner));
  }

  /* --------------------------------------------------------- summary */

  push();
  push(label("summary"));
  push();
  const perDay = stats.totals.cost / Math.max(stats.totals.days, 1);
  const perReq = stats.totals.cost / Math.max(stats.totals.requests, 1);
  const tokPerReq = stats.totals.tokens / Math.max(stats.totals.requests, 1);
  for (const [k, v] of [
    ["requests", fullNumber(stats.totals.requests)],
    ["active days", fullNumber(stats.totals.days)],
    ["per active day", money2(perDay)],
    ["per request", money2(perReq)],
    ["tokens per request", compactNumber(tokPerReq)],
    ["biggest day", stats.best ? money2(stats.best.cost) : "—"],
    ["first reported", stats.firstDay ?? "—"],
    ["last reported", stats.lastDay ? sinceDay(stats.lastDay) : "—"],
  ] as [string, string][]) {
    push(dim(padEnd(k, 20)) + v);
  }

  if (user.plans.length > 0) out.push(...plansBlock(data, inner));

  /* --------------------------------------------------- cost anatomy */

  if (anatomy.cost.total > 0) out.push(...anatomyBlock(data, inner));

  push();
  return out;
}

/* ------------------------------------------------------------- sections */

function anatomyBlock(data: ProfileData, inner: number): string[] {
  const out: string[] = [];
  const push = (s = "") => out.push(s ? PAD + s : "");
  const { anatomy, benchmark, burn, whatIf } = data;
  const { cost, tokens, reuse } = anatomy;

  push();
  push(rule(inner));
  push();
  push(label("where the money went"));
  push();

  const barWidth = Math.min(inner, 60);
  push(
    stackedBar(
      [
        { label: "cache read", value: cost.cacheRead, paint: cyan },
        { label: "cache write", value: cost.cacheWrite, paint: (s) => s },
        { label: "output", value: cost.output, paint: gray },
        { label: "input", value: cost.input, paint: dim },
      ],
      barWidth,
    ),
  );
  push();

  push(dim(padEnd("bucket", 14) + padStart("tokens", 9) + padStart("cost", 12) + padStart("share", 8)));
  const rows: [string, number, number][] = [
    ["cache read", tokens.cacheRead, cost.cacheRead],
    ["cache write", tokens.cacheWrite5m + tokens.cacheWrite1h, cost.cacheWrite],
    ["output", tokens.output, cost.output],
    ["input", tokens.input, cost.input],
  ];
  for (const [name, tok, usdValue] of rows) {
    push(
      padEnd(name, 14) +
        dim(padStart(compactNumber(tok), 9)) +
        padStart(anatomyUsd(usdValue), 12) +
        dim(padStart(pct(usdValue / cost.total), 8)),
    );
  }

  if (reuse.cacheShareOfCost > 0.5) {
    push();
    push(
      dim(
        `${pct(reuse.cacheShareOfCost)} of this is cache, not completions — context`,
      ),
    );
    push(dim("re-read each turn, rather than anything typed or generated."));
  }

  /* ------------------------------------------------------------ reuse */

  if (reuse.ratio !== null) {
    push();
    push(label("cache reuse"));
    push();
    push(bold(reuse.ratio.toFixed(1)) + dim(":1"));
    push(
      dim(
        `${compactNumber(reuse.cacheRead)} read back for every ` +
          `${compactNumber(reuse.cacheWrite)} written. Higher is better.`,
      ),
    );

    if (benchmark.median !== null && benchmark.percentile !== null) {
      push();
      push(
        dim(
          `median ${benchmark.median.toFixed(1)}:1 across ${benchmark.cohort} people · ` +
            `you are ${ordinal(benchmark.percentile)} percentile`,
        ),
      );
      if (benchmark.headroomUsd !== null) {
        push(dim(`at the median you would have spent about ${anatomyUsd(benchmark.headroomUsd)} less.`));
      }
    } else {
      push(dim("not enough people syncing yet to compare against."));
    }
  }

  /* -------------------------------------------------------- burn rate */

  if (burn.projected !== null) {
    push();
    push(label("this month"));
    push();
    push(
      bold(anatomyUsd(burn.monthToDate)) +
        dim(` so far · ${anatomyUsd(burn.perDay)}/day · on pace for ${anatomyUsd(burn.projected)}`),
    );
    push(
      dim(
        `projection uses the last fortnight over ${burn.daysRemaining} remaining ` +
          `${burn.daysRemaining === 1 ? "day" : "days"}.`,
      ),
    );
  }

  /* ---------------------------------------------------------- what if */

  if (whatIf.rows.length > 0) {
    push();
    push(label("the same tokens, priced elsewhere"));
    push();

    const w = { model: 18, total: 11, delta: 13, eff: 9 };
    push(
      dim(
        padEnd("model", w.model) +
          padStart("total", w.total) +
          padStart("vs yours", w.delta) +
          padStart("effective", w.eff),
      ),
    );

    // The anchor row. Without it the percentages float free of the figure they
    // are measured against.
    push(
      padEnd("your mix", w.model) +
        padStart(anatomyUsd(whatIf.actualUsd), w.total) +
        dim(padStart("—", w.delta)) +
        padStart(rate(whatIf.actualBlendedRate), w.eff),
    );

    for (const row of whatIf.rows) {
      const used = whatIf.actualModels.includes(row.model);
      const cheaper = row.deltaUsd < 0;
      const name = shortModel(row.model) + (used ? dim(" ·used") : "");
      const change =
        row.deltaUsd === 0
          ? dim("—")
          : (cheaper ? green : dim)(
              `${cheaper ? "−" : "+"}${anatomyUsd(Math.abs(row.deltaUsd))} ${Math.abs(row.deltaPct).toFixed(0)}%`,
            );
      push(
        padEnd(truncate(used ? cyan(name) : name, w.model), w.model) +
          padStart(anatomyUsd(row.costUsd), w.total) +
          padStart(change, w.delta) +
          dim(padStart(rate(row.blendedRate), w.eff)),
      );
    }

    push();
    push(dim("USD per million tokens. `effective` applies each rate card to your"));
    push(dim("own mix. Published rates only: a weaker model often needs more"));
    push(dim("turns, and those are not counted."));
  }

  return out;
}

function plansBlock(data: ProfileData, inner: number): string[] {
  const out: string[] = [];
  const push = (s = "") => out.push(s ? PAD + s : "");
  const priced = data.user.plans.filter((p) => typeof p.monthlyUsd === "number");
  const monthly = priced.reduce((sum, p) => sum + (p.monthlyUsd ?? 0), 0);

  push();
  push(label("what they pay for"));
  push();
  push(priced.length > 0 ? bold(`${money2(monthly)}/mo`) : dim(`${data.user.plans.length} plans`));
  for (const plan of data.user.plans) {
    const name = [plan.provider, plan.plan].filter(Boolean).join(" ");
    push(
      padEnd(truncate(name || "—", 28), 28) +
        dim(padEnd(plan.kind ?? "", 12)) +
        (typeof plan.monthlyUsd === "number" ? dim(`${money2(plan.monthlyUsd)}/mo`) : ""),
    );
  }
  push();
  push(dim("Self-reported. Nothing here is checked against a provider."));
  return out;
}

/* ------------------------------------------------------------- helpers */

function cell(name: string, value: string): string {
  return padEnd(dim(name) + " " + bold(value), 26);
}

/** A labelled proportional bar, the terminal's version of the site's ShareBars. */
function share(name: string, value: string, part: number, total: number, inner: number): string {
  const width = Math.max(8, Math.min(inner - 44, 28));
  const fraction = total > 0 ? part / total : 0;
  return (
    padEnd(truncate(name, 16), 16) +
    bar(fraction, width, cyan) +
    dim(padStart(value, 12)) +
    dim(padStart(pct(fraction), 8))
  );
}

function pct(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

/** Per-million rates run to fractions of a cent, so two decimals hide them. */
function rate(n: number): string {
  return n >= 1 ? `$${n.toFixed(2)}` : `$${n.toFixed(3)}`;
}

function ordinal(n: number): string {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");
  return `${n}${suffix}`;
}

/** "3 days ago" for a YYYY-MM-DD, matching the site's `sinceDay`. */
function sinceDay(day: string): string {
  const then = new Date(day.length <= 10 ? `${day.slice(0, 10)}T00:00:00Z` : day);
  if (Number.isNaN(then.getTime())) return day;
  const days = Math.floor((Date.now() - then.getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return relativeTime(then.toISOString());
}
