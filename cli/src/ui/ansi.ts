/**
 * Colour handling.
 *
 * Every style function degrades to identity when colour is unwanted, so callers
 * never branch on whether the terminal supports it. We honour the NO_COLOR
 * convention (https://no-color.org) and FORCE_COLOR, and stay plain whenever
 * stdout is not a TTY so piping into a file or `less` produces clean text.
 */

function colorEnabled(): boolean {
  if (process.env.NO_COLOR !== undefined && process.env.NO_COLOR !== "") return false;
  if (process.env.TOKN_NO_COLOR) return false;
  if (process.env.FORCE_COLOR !== undefined && process.env.FORCE_COLOR !== "0") return true;
  if (process.env.TERM === "dumb") return false;
  return process.stdout.isTTY === true;
}

export const COLOR = colorEnabled();

const wrap = (open: string, close: string) => (s: string) =>
  COLOR ? `\u001b[${open}m${s}\u001b[${close}m` : s;

export const bold = wrap("1", "22");
export const dim = wrap("2", "22");
export const italic = wrap("3", "23");
export const underline = wrap("4", "24");

/**
 * Reverse video, for the selected row in the full-screen dashboard.
 *
 * Swapping foreground and background is the one highlight that works without
 * knowing the user's theme. Picking a background colour would mean guessing,
 * and the guess is wrong on roughly half of terminals.
 */
export const inverse = wrap("7", "27");

export const red = wrap("31", "39");
export const green = wrap("32", "39");
export const yellow = wrap("33", "39");
export const blue = wrap("34", "39");
export const magenta = wrap("35", "39");
export const cyan = wrap("36", "39");
export const gray = wrap("90", "39");

/** Unicode symbols, with ASCII fallbacks for terminals that cannot render them. */
const unicode = process.platform !== "win32" || Boolean(process.env.WT_SESSION);

export const sym = {
  tick: unicode ? "✓" : "v",
  cross: unicode ? "✗" : "x",
  arrow: unicode ? "›" : ">",
  bullet: unicode ? "•" : "-",
  line: unicode ? "─" : "-",
  ellipsis: unicode ? "…" : "...",
};

/** Visible width of a string, ignoring ANSI escape sequences. */
export function visibleWidth(s: string): number {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\u001b\[[0-9;]*m/g, "").length;
}

export function padEnd(s: string, width: number): string {
  return s + " ".repeat(Math.max(0, width - visibleWidth(s)));
}

export function padStart(s: string, width: number): string {
  return " ".repeat(Math.max(0, width - visibleWidth(s))) + s;
}
