import { COLOR, dim } from "./ansi.js";

/**
 * A contribution graph for the terminal.
 *
 * One column per week, one row per weekday, a year of history running left to
 * right. The shape is familiar enough that nobody needs a legend to read it,
 * which is the whole reason for copying it.
 *
 * Width is the constraint: 53 weeks plus the weekday gutter is about 57
 * columns, so it fits an 80-column terminal. On anything narrower the graph
 * drops whole weeks off the left rather than wrapping or squashing.
 */

/** Matches the dashboard's lime, dark to bright. */
const LEVELS: [number, number, number][] = [
  [38, 40, 30],
  [61, 84, 24],
  [104, 148, 28],
  [160, 208, 34],
  [204, 255, 51],
];

const EMPTY: [number, number, number] = [30, 30, 34];

/** Truecolor where the terminal admits to it, 256-colour otherwise. */
function paint(rgb: [number, number, number], glyph: string): string {
  if (!COLOR) return glyph;

  const [r, g, b] = rgb;
  if (process.env.COLORTERM === "truecolor" || process.env.COLORTERM === "24bit") {
    return `\u001b[38;2;${r};${g};${b}m${glyph}\u001b[39m`;
  }

  // 6x6x6 colour cube, which every 256-colour terminal has.
  const q = (v: number) => Math.round((v / 255) * 5);
  const index = 16 + 36 * q(r) + 6 * q(g) + q(b);
  return `\u001b[38;5;${index}m${glyph}\u001b[39m`;
}

const CELL = "■";
const DAY_LABELS = ["", "M", "", "W", "", "F", ""];
const MONTHS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

export interface HeatmapDay {
  day: string;
  value: number;
}

/**
 * Thresholds from the data rather than fixed numbers.
 *
 * Spend varies by orders of magnitude between people, so a fixed scale would
 * leave most graphs either flat or saturated. Quartiles of the active days keep
 * the shape readable whoever is looking at it.
 */
function thresholds(values: number[]): number[] {
  const active = values.filter((v) => v > 0).sort((a, b) => a - b);
  if (active.length === 0) return [0, 0, 0, 0];

  const at = (fraction: number) =>
    active[Math.min(active.length - 1, Math.floor(active.length * fraction))] ?? 0;

  return [at(0.25), at(0.5), at(0.75), at(0.9)];
}

function levelOf(value: number, cuts: number[]): number {
  if (value <= 0) return -1;
  if (value <= (cuts[0] ?? 0)) return 0;
  if (value <= (cuts[1] ?? 0)) return 1;
  if (value <= (cuts[2] ?? 0)) return 2;
  if (value <= (cuts[3] ?? 0)) return 3;
  return 4;
}

function toKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export interface HeatmapOptions {
  /** Weeks of history. Trimmed to fit the terminal. */
  weeks?: number;
  width?: number;
}

export function renderHeatmap(days: HeatmapDay[], options: HeatmapOptions = {}): string {
  const byDay = new Map(days.map((d) => [d.day, d.value]));
  const cuts = thresholds(days.map((d) => d.value));

  const available = options.width ?? process.stdout.columns ?? 80;
  // 4 columns of gutter for the weekday labels, 2 of breathing room.
  const maxWeeks = Math.max(8, Math.min(options.weeks ?? 53, available - 6));

  // The grid ends on the Saturday of this week, so today is always in the
  // last column and the graph reads as "up to now".
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const end = new Date(today);
  end.setDate(end.getDate() + (6 - end.getDay()));

  const columns: (Date | null)[][] = [];
  for (let w = maxWeeks - 1; w >= 0; w--) {
    const column: (Date | null)[] = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(end);
      date.setDate(end.getDate() - w * 7 - (6 - d));
      // Days after today have not happened; leave them blank rather than
      // drawing them as zero-usage.
      column.push(date > today ? null : date);
    }
    columns.push(column);
  }

  const lines: string[] = [];

  // Month letter above the column where that month starts.
  let monthRow = "    ";
  let lastMonth = -1;
  for (const column of columns) {
    const first = column.find((d): d is Date => d !== null);
    const month = first ? first.getMonth() : -1;
    if (month !== -1 && month !== lastMonth && first!.getDate() <= 7) {
      monthRow += MONTHS[month] ?? " ";
      lastMonth = month;
    } else {
      monthRow += " ";
    }
  }
  lines.push(dim(monthRow.trimEnd()));

  for (let d = 0; d < 7; d++) {
    let row = dim((DAY_LABELS[d] ?? "").padEnd(3)) + " ";
    for (const column of columns) {
      const date = column[d];
      if (!date) {
        row += " ";
        continue;
      }
      const level = levelOf(byDay.get(toKey(date)) ?? 0, cuts);
      row += level === -1 ? paint(EMPTY, CELL) : paint(LEVELS[level]!, CELL);
    }
    lines.push(row);
  }

  return lines.join("\n");
}

/** The less/more strip that explains the shading. */
export function renderHeatmapLegend(): string {
  const swatches = LEVELS.map((rgb) => paint(rgb, CELL)).join("");
  return `${dim("less ")}${paint(EMPTY, CELL)}${swatches}${dim(" more")}`;
}
