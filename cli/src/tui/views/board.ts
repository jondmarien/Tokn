import { bold, cyan, dim, gray, inverse, padEnd, padStart, visibleWidth } from "../../ui/ansi.js";
import { compactNumber, fullNumber, money2, shortModel } from "../../ui/format.js";
import {
  delta,
  highlightRow,
  rule,
  scrollHint,
  sparkline,
  truncate,
  viewport,
} from "../../ui/widgets.js";
import { METRICS, PERIODS, type BoardData, type BoardRow, type Metric } from "../types.js";

/**
 * The leaderboard, as the home page shows it.
 *
 * Column order follows the website: rank, user, spend, tokens, requests,
 * model, days. The site's `last` column is replaced by a sparkline of the last
 * fortnight, which is the one thing a terminal can show better than a table
 * cell — a date reads the same in both, a shape does not.
 *
 * The ranked metric is the only bright column; the others are dimmed exactly
 * as the page dims them, so which number the ordering refers to is visible
 * without reading the filter row.
 */

export function render(data: BoardData, width: number, cursor: number, height: number): string[] {
  const lines: string[] = [];
  const inner = width - 4;

  /* ---------------------------------------------------------- headline */

  lines.push("");
  lines.push(
    "  " +
      bold(money2(data.totals.cost)) +
      dim(
        `  ${compactNumber(data.totals.tokens)} tokens · ` +
          `${fullNumber(data.totals.requests)} requests · ` +
          `${fullNumber(data.totals.users)} of ${fullNumber(data.totals.registered)} developers`,
      ),
  );
  lines.push("");

  /* ----------------------------------------------------------- filters */

  lines.push("  " + segmented("period", PERIODS, data.period) + dim("   p"));
  lines.push("  " + segmented("rank by", METRICS, data.metric) + dim("   m"));
  lines.push("");

  if (data.rows.length === 0) {
    lines.push(dim("  nothing reported for this window yet."));
    lines.push(dim("  run `tokn sync` to be first."));
    return lines;
  }

  /* ------------------------------------------------------------- table */

  const cols = layout(inner);
  lines.push("  " + header(cols, data.metric));
  lines.push("  " + rule(inner));

  // The table gets whatever vertical space is left after the chrome above and
  // the footer the app draws below.
  const body = Math.max(3, height - lines.length - 3);
  const { slice, offset } = viewport(data.rows, cursor, body);

  for (const [i, row] of slice.entries()) {
    lines.push("  " + line(row, cols, data.metric, offset + i === cursor));
  }

  /* -------------------------------------------------------------- self */

  // Off the end of the board: the site appends your own row rather than
  // leaving you unable to find yourself, and so does this.
  if (data.self) {
    lines.push("  " + dim("·".repeat(inner)));
    lines.push("  " + line(data.self, cols, data.metric, false));
  }

  const hint = scrollHint(offset, slice.length, data.rows.length);
  if (hint) lines.push("  " + padStart(hint, inner));

  return lines;
}

/** The handle under the cursor, for opening a profile. */
export function handleAt(data: BoardData, cursor: number): string | null {
  return data.rows[cursor]?.handle ?? null;
}

export function rowCount(data: BoardData): number {
  return data.rows.length;
}

/* ------------------------------------------------------------- internals */

interface Cols {
  rank: number;
  move: number;
  user: number;
  cost: number;
  tokens: number;
  requests: number;
  model: number;
  days: number;
  spark: number;
}

/**
 * Columns collapse from the right as the terminal narrows.
 *
 * Every column has a floor width rather than a share of the total, because a
 * proportional layout turns `$10,432.18` into `$10,4…` on a narrow window —
 * the number is the point, so it is the last thing allowed to shrink.
 */
function layout(inner: number): Cols {
  const base = { rank: 4, move: 4, user: 18, cost: 11, tokens: 8, requests: 9, model: 12, days: 5, spark: 0 };
  const used = () => Object.values(base).reduce((a, b) => a + b, 0) + 8 * 2;

  if (inner >= used() + 16) base.spark = 14;
  if (inner < used()) base.model = 0;
  if (inner < used()) base.days = 0;
  if (inner < used()) base.requests = 0;
  if (inner < used()) base.tokens = 0;
  if (inner < used()) base.move = 0;

  // Whatever is left over widens the handle column, which is the one people
  // actually read and the one most likely to be truncated.
  const spare = inner - used();
  if (spare > 0) base.user += Math.min(spare, 20);
  return base;
}

function header(c: Cols, metric: Metric): string {
  const cells: string[] = [padStart("#", c.rank)];
  if (c.move) cells.push(" ".repeat(c.move));
  cells.push(padEnd("user", c.user));
  cells.push(padStart("spend", c.cost));
  if (c.tokens) cells.push(padStart("tokens", c.tokens));
  if (c.requests) cells.push(padStart("reqs", c.requests));
  if (c.model) cells.push(padEnd("model", c.model));
  if (c.days) cells.push(padStart("days", c.days));
  if (c.spark) cells.push(padEnd("14d", c.spark));
  return dim(cells.join("  "));
}

function line(row: BoardRow, c: Cols, metric: Metric, active: boolean): string {
  // Dim every column except the one the board is sorted by — the same signal
  // the website uses to say "this is the number you are looking at".
  const lit = (m: Metric, s: string) => (m === metric ? s : dim(s));

  const cells: string[] = [padStart(String(row.rank), c.rank)];

  if (c.move) {
    const moved = row.previousRank === null ? null : row.previousRank - row.rank;
    cells.push(padEnd(delta(moved), c.move));
  }

  const who = `@${row.handle}` + (row.billing === "subscription" ? dim(" ◦") : "");
  cells.push(padEnd(truncate(row.isSelf ? cyan(who) : who, c.user), c.user));

  cells.push(padStart(lit("cost", money2(row.cost)), c.cost));
  if (c.tokens) cells.push(padStart(lit("tokens", compactNumber(row.tokens)), c.tokens));
  if (c.requests) cells.push(padStart(lit("requests", fullNumber(row.requests)), c.requests));
  if (c.model) {
    cells.push(padEnd(dim(truncate(row.topModel ? shortModel(row.topModel) : "—", c.model)), c.model));
  }
  if (c.days) cells.push(padStart(dim(String(row.days)), c.days));
  if (c.spark) cells.push(padEnd(row.series.length ? sparkline(row.series, c.spark) : dim("·"), c.spark));

  const text = cells.join("  ");
  return active ? highlightRow(text) : text;
}

function segmented<T extends string>(
  name: string,
  options: { key: T; label: string }[],
  active: T,
): string {
  const rendered = options
    .map((o) => (o.key === active ? bold(o.label) : dim(o.label)))
    .join(dim(" · "));
  return gray(padEnd(name, 8)) + rendered;
}
