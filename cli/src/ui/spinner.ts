import { COLOR, dim, green, red, sym, visibleWidth } from "./ansi.js";

/**
 * A single-line progress indicator that cleans up after itself.
 *
 * Writes to stderr so that `tokn scan --json > out.json` stays clean, and
 * becomes a silent no-op on a non-TTY so CI logs do not fill with spinner
 * frames. The cursor is hidden while spinning and restored on exit — including
 * on Ctrl-C, which otherwise leaves the user's terminal without a cursor.
 */

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const ASCII_FRAMES = ["-", "\\", "|", "/"];

/**
 * Eighth-width blocks for the bar's leading edge.
 *
 * Without them the bar advances a whole cell at a time, which on a 30-cell bar
 * means it only moves every 3% and reads as stuck between jumps. With them the
 * edge creeps, so a long scan looks like it is working even when the
 * percentage has not changed.
 */
const EIGHTHS = ["", "▏", "▎", "▍", "▌", "▋", "▊", "▉"];
const FULL = "█";
const EMPTY = "░";

/** Widest the bar is allowed to get; past this it stops reading as a bar. */
const MAX_BAR = 36;
const MIN_BAR = 8;

export class Spinner {
  private timer: NodeJS.Timeout | null = null;
  private frame = 0;
  private text = "";
  /** Null while indeterminate; 0..1 once a caller reports real progress. */
  private fraction: number | null = null;
  private detail = "";
  /** Last line written, so an unchanged frame costs nothing. */
  private lastLine = "";
  private readonly active: boolean;
  private readonly frames: string[];
  private cleanupBound: (() => void) | null = null;

  constructor(text = "") {
    this.text = text;
    this.active = process.stderr.isTTY === true && !process.env.TOKN_NO_SPINNER;
    this.frames = COLOR ? FRAMES : ASCII_FRAMES;
  }

  start(text?: string): this {
    if (text !== undefined) this.text = text;
    if (!this.active) return this;

    process.stderr.write("\u001b[?25l"); // hide cursor
    this.cleanupBound = () => {
      this.clear();
      process.stderr.write("\u001b[?25h");
    };
    process.on("exit", this.cleanupBound);

    this.render();
    this.timer = setInterval(() => {
      this.frame = (this.frame + 1) % this.frames.length;
      this.render();
    }, 80);
    this.timer.unref?.();
    return this;
  }

  /** Change the message without restarting the animation. */
  update(text: string): void {
    this.text = text;
    // Back to the indeterminate spinner: a caller that knew a total and then
    // moved on to work that has none should not leave a frozen bar on screen.
    this.fraction = null;
    this.detail = "";
    if (this.active && this.timer) this.render();
  }

  /**
   * Switch to a determinate bar.
   *
   * `fraction` is clamped rather than trusted: a source that miscounts its own
   * files would otherwise draw a bar wider than the terminal, and wrapping the
   * line defeats the single-line erase that keeps this to one row.
   */
  progress(label: string, fraction: number, detail = ""): void {
    this.text = label;
    this.fraction = Math.min(1, Math.max(0, Number.isFinite(fraction) ? fraction : 0));
    this.detail = detail;
    if (this.active && this.timer) this.render();
  }

  private render(): void {
    const line = this.compose();
    // The animation ticks twelve times a second and a bar that has not moved
    // composes the same string every time. Skipping the write keeps a long
    // scan from flooding stderr with redraws of an identical line.
    if (line === this.lastLine) return;
    this.clear();
    this.lastLine = line;
    process.stderr.write(line);
  }

  private compose(): string {
    if (this.fraction === null) {
      const f = this.frames[this.frame] ?? "";
      return `  ${dim(f)} ${this.text}`;
    }

    const percent = `${String(Math.round(this.fraction * 100)).padStart(3)}%`;
    const suffix = this.detail ? `  ${dim(this.detail)}` : "";
    // Indent, label, space, both brackets, space, the percent, and the detail.
    const fixed =
      2 + visibleWidth(this.text) + 1 + 2 + 1 + percent.length + visibleWidth(suffix);
    const columns = process.stderr.columns ?? 80;
    const width = Math.max(MIN_BAR, Math.min(MAX_BAR, columns - fixed - 1));

    return `  ${this.text} ${dim("[")}${this.bar(width)}${dim("]")} ${percent}${suffix}`;
  }

  private bar(width: number): string {
    const fraction = this.fraction ?? 0;

    if (!COLOR) {
      const filled = Math.round(fraction * width);
      return "#".repeat(filled) + "-".repeat(width - filled);
    }

    const exact = fraction * width;
    const whole = Math.floor(exact);
    const partial = EIGHTHS[Math.floor((exact - whole) * 8)] ?? "";
    // A partial glyph still occupies a cell, so the remainder must account for
    // it or the bar grows by a character each time the edge crosses a cell.
    const rest = Math.max(0, width - whole - (partial ? 1 : 0));
    return green(FULL.repeat(whole) + partial) + dim(EMPTY.repeat(rest));
  }

  private clear(): void {
    if (!this.active) return;
    this.lastLine = "";
    process.stderr.write("\r\u001b[2K");
  }

  private stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (!this.active) return;
    this.clear();
    process.stderr.write("\u001b[?25h"); // restore cursor
    if (this.cleanupBound) {
      process.removeListener("exit", this.cleanupBound);
      this.cleanupBound = null;
    }
  }

  /** Stop and leave a success line in place of the spinner. */
  succeed(text: string): void {
    this.stop();
    process.stderr.write(`  ${green(sym.tick)} ${text}\n`);
  }

  /** Stop and leave a failure line in place of the spinner. */
  fail(text: string): void {
    this.stop();
    process.stderr.write(`  ${red(sym.cross)} ${text}\n`);
  }

  /** Stop and leave nothing behind. */
  clearAndStop(): void {
    this.stop();
  }
}
