import { bold, dim, gray, green, inverse, padEnd, padStart, red, visibleWidth } from "./ansi.js";

/**
 * Drawing primitives for the full-screen dashboard.
 *
 * Nothing here writes an escape sequence directly: colour goes through
 * `ansi.ts`, which is the one place that knows whether colour is on at all.
 * That matters because this output is measured as well as printed — every
 * width calculation uses `visibleWidth`, so a stray escape written by hand
 * would silently throw off every column to its right.
 */

/** Eighth-blocks, for sub-character resolution in bars and sparklines. */
const EIGHTHS = ["", "▏", "▎", "▍", "▌", "▋", "▊", "▉", "█"];
const SPARK = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];

/**
 * A sparkline over a series.
 *
 * Scaled to the series maximum rather than to zero, because these are spend
 * curves: the interesting shape is the variation between active days, and
 * anchoring at zero flattens that into a line of identical bars.
 */
export function sparkline(values: number[], width?: number): string {
  if (values.length === 0) return "";
  const series = width && values.length > width ? bucket(values, width) : values;
  const max = Math.max(...series);
  if (max <= 0) return dim("▁".repeat(series.length));

  return series
    .map((v) => {
      if (v <= 0) return dim("▁");
      const level = Math.min(SPARK.length - 1, Math.max(0, Math.round((v / max) * (SPARK.length - 1))));
      return SPARK[level];
    })
    .join("");
}

/** Average a series down to `width` buckets, preserving overall shape. */
function bucket(values: number[], width: number): number[] {
  const out: number[] = [];
  const per = values.length / width;
  for (let i = 0; i < width; i++) {
    const slice = values.slice(Math.floor(i * per), Math.max(Math.floor((i + 1) * per), Math.floor(i * per) + 1));
    out.push(slice.length ? slice.reduce((a, b) => a + b, 0) / slice.length : 0);
  }
  return out;
}

/**
 * A single proportional bar, rendered to eighth-of-a-cell precision.
 *
 * The sub-cell resolution is not decoration: at 20 cells wide, rounding to
 * whole cells turns every share under 2.5% into either nothing or a full cell,
 * which is exactly the range where "output is 3% of the bill" lives.
 */
export function bar(fraction: number, width: number, paint: (s: string) => string = (s) => s): string {
  const clamped = Math.max(0, Math.min(1, fraction));
  const units = clamped * width * 8;
  const full = Math.floor(units / 8);
  const rest = Math.round(units % 8);
  const head = "█".repeat(full) + (rest > 0 ? EIGHTHS[rest] : "");
  return paint(head) + dim("·".repeat(Math.max(0, width - visibleWidth(head))));
}

export interface Segment {
  label: string;
  value: number;
  paint: (s: string) => string;
}

/**
 * A stacked bar: the cost anatomy from the website, in one row of cells.
 *
 * Segments below half a cell are dropped rather than rounded up to one, so the
 * bar's proportions stay honest at the cost of hiding a rounding sliver.
 */
export function stackedBar(segments: Segment[], width: number): string {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  if (total <= 0) return dim("·".repeat(width));

  let used = 0;
  let out = "";
  for (const seg of segments) {
    const cells = Math.round((seg.value / total) * width);
    if (cells < 1) continue;
    const take = Math.min(cells, width - used);
    if (take < 1) break;
    out += seg.paint("█".repeat(take));
    used += take;
  }
  return out + dim("·".repeat(Math.max(0, width - used)));
}

/** A row of tabs with the active one marked. */
export function tabs(items: string[], active: number): string {
  return items
    .map((item, i) =>
      i === active ? bold(`  ${item}  `) : dim(`  ${item}  `),
    )
    .join(dim("│"));
}

/** A full-width horizontal rule. */
export function rule(width: number): string {
  return dim("─".repeat(Math.max(0, width)));
}

/** A section heading in the site's lowercase label style. */
export function label(text: string): string {
  return dim(text.toLowerCase());
}

/**
 * Truncate to a visible width, accounting for escape sequences already in the
 * string. Appends an ellipsis when it actually cuts something.
 */
export function truncate(s: string, width: number): string {
  if (visibleWidth(s) <= width) return s;
  if (width <= 1) return "…";

  // Walk the string copying characters while skipping escape sequences, so a
  // coloured string is cut at the right visible column and its reset survives.
  let out = "";
  let seen = 0;
  let i = 0;
  while (i < s.length && seen < width - 1) {
    if (s[i] === "\u001b") {
      const end = s.indexOf("m", i);
      if (end === -1) break;
      out += s.slice(i, end + 1);
      i = end + 1;
      continue;
    }
    out += s[i];
    seen++;
    i++;
  }
  return out + "…";
}

/** A signed delta, coloured by direction, for movement columns. */
export function delta(n: number | null, opts: { goodWhenUp?: boolean } = {}): string {
  if (n === null || n === 0) return dim("·");
  const up = n > 0;
  const good = opts.goodWhenUp ?? true ? up : !up;
  const text = `${up ? "▲" : "▼"}${Math.abs(n)}`;
  return good ? green(text) : red(text);
}

/**
 * Lay out rows into columns without a table border.
 *
 * `renderTable` draws the bordered tables used in one-shot command output;
 * this is the borderless variant the full-screen views use, where a border
 * around every panel would leave no room for the data.
 */
export interface Col {
  header: string;
  align?: "left" | "right";
  width: number;
}

export function columns(cols: Col[], rows: string[][], gap = 2): { header: string; body: string[] } {
  const spacer = " ".repeat(gap);
  const fit = (cell: string, col: Col) => {
    const cut = truncate(cell, col.width);
    return col.align === "right" ? padStart(cut, col.width) : padEnd(cut, col.width);
  };

  return {
    header: cols.map((c) => dim(fit(c.header, c))).join(spacer),
    body: rows.map((row) => row.map((cell, i) => fit(cell, cols[i]!)).join(spacer)),
  };
}

/**
 * Clamp a list to a viewport and keep the cursor inside it.
 *
 * Returns the visible slice plus how far down the list the window starts, so
 * the caller can draw a scroll indicator. The window only moves when the
 * cursor would leave it, which keeps the list still while paging through the
 * middle of it rather than recentring on every keypress.
 */
export function viewport<T>(
  items: T[],
  cursor: number,
  height: number,
): { slice: T[]; offset: number } {
  if (items.length <= height) return { slice: items, offset: 0 };
  const half = Math.floor(height / 2);
  const offset = Math.max(0, Math.min(cursor - half, items.length - height));
  return { slice: items.slice(offset, offset + height), offset };
}

/** A right-aligned scroll hint, e.g. "12–24 of 100". */
export function scrollHint(offset: number, shown: number, total: number): string {
  if (total <= shown) return "";
  return gray(`${offset + 1}–${offset + shown} of ${total}`);
}

/**
 * Mark a row as selected, given a row that already contains colour.
 *
 * Reverse video composes badly with nested colour: an inner reset turns the
 * highlight off partway along the row, leaving a bar that stops halfway.
 * Stripping back to plain text before inverting is the only way to get a solid
 * one, and the lost colour is not missed because the inversion is the emphasis.
 */
export function highlightRow(text: string): string {
  return inverse(text.replace(/\u001b\[[0-9;]*m/g, ""));
}
