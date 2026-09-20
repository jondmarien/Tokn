import { COLOR, dim, green, red, sym } from "./ansi.js";

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

export class Spinner {
  private timer: NodeJS.Timeout | null = null;
  private frame = 0;
  private text = "";
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
    if (this.active && this.timer) this.render();
  }

  private render(): void {
    const f = this.frames[this.frame] ?? "";
    this.clear();
    process.stderr.write(`  ${dim(f)} ${this.text}`);
  }

  private clear(): void {
    if (!this.active) return;
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
