import { COLOR, bold, dim } from "./ansi.js";

/**
 * The tokn wordmark.
 *
 * Half-block glyphs rather than ASCII art: they keep the mark two rows tall, so
 * it can head the dashboard without pushing the actual numbers below the fold.
 * Terminals that cannot render block characters get the plain word instead.
 */

const LIME: [number, number, number] = [204, 255, 51];

/**
 * Two sizes.
 *
 * The large mark is for `tokn setup`, which somebody sees once and where the
 * three rows buy a real first impression. The compact one heads the dashboard,
 * which is shown many times a day and should not spend a third of a screen on
 * its own name.
 *
 * The `k` is drawn with both diagonals in each: a single diagonal reads as an
 * `h` at terminal sizes, which turns the word into "tohn".
 */
const GLYPHS_LARGE = [
  "██████  ██████  ██  ██  ██   ██",
  "  ██    ██  ██  ██▄██   ███  ██",
  "  ██    ██████  ██  ██  ██  ███",
];

const GLYPHS_COMPACT = [
  "▀█▀ ▄▀▄ █▄▀ █▀▄",
  " █  ▀▄▀ █▀▄ █ █",
];

const unicode = process.platform !== "win32" || Boolean(process.env.WT_SESSION);

/**
 * Written with unicode escapes rather than a literal ESC byte: a raw control
 * character in source does not survive every editor or transport, and when it
 * is lost the escape sequence prints as visible text instead of colouring it.
 */
function lime(text: string): string {
  if (!COLOR) return text;
  const [r, g, b] = LIME;
  if (process.env.COLORTERM === "truecolor" || process.env.COLORTERM === "24bit") {
    return `\u001b[38;2;${r};${g};${b}m${text}\u001b[39m`;
  }
  return `\u001b[38;5;191m${text}\u001b[39m`;
}

export interface LogoOptions {
  indent?: string;
  /** Shown under the mark, e.g. a version or a tagline. */
  subtitle?: string;
  /** "large" for a first run, "compact" for anything recurring. */
  size?: "large" | "compact";
}

export function renderLogo(options: LogoOptions = {}): string {
  const indent = options.indent ?? "  ";

  if (!unicode) {
    const line = `${indent}${lime(bold("tokn"))}`;
    return options.subtitle ? `${line}\n${indent}${dim(options.subtitle)}` : line;
  }

  const glyphs = options.size === "large" ? GLYPHS_LARGE : GLYPHS_COMPACT;
  const lines = glyphs.map((row) => `${indent}${lime(row)}`);
  if (options.subtitle) {
    lines.push("");
    lines.push(`${indent}${dim(options.subtitle)}`);
  }
  return lines.join("\n");
}

/**
 * One-line mark for headers where two rows is too much.
 *
 * `[·]` is the terminal spelling of the website's logo — a token, bracketed.
 * The web mark draws it as two rounded strokes around a square; in a cell grid
 * the brackets are already a glyph, so the same idea costs three characters.
 * A terminal that cannot promise the box-drawing set gets a plain dot.
 */
export function renderWordmark(): string {
  const mark = lime(unicode ? "[·]" : "[*]");
  return `${mark} ${bold("tokn")}`;
}
