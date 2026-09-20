import { emitKeypressEvents } from "node:readline";

/**
 * The full-screen runtime behind `tokn dashboard`.
 *
 * Everything here exists to make one guarantee: whatever happens to the app
 * above it — a thrown error, a SIGINT, a crash mid-render — the terminal is
 * handed back the way it was found. A TUI that leaves raw mode on, or the
 * cursor hidden, or the alternate screen up, breaks the shell the user goes
 * back to, and they have to type `reset` blind to fix it. So teardown is
 * registered before the first byte of setup, and runs exactly once.
 *
 * Rendering is a full repaint of a string per frame rather than a diff. At a
 * few thousand cells the redraw is imperceptible and the alternative — tracking
 * what changed — is where flicker bugs and stale-cell artifacts come from.
 */

/* Written as \u001b escapes throughout. A literal ESC byte in a source file
 * survives every editor and diff tool until something normalises it away, and
 * then the sequence silently prints as text. `npm run build` audits for it. */
const ALT_ON = "\u001b[?1049h";
const ALT_OFF = "\u001b[?1049l";
const CURSOR_HIDE = "\u001b[?25l";
const CURSOR_SHOW = "\u001b[?25h";
const CURSOR_HOME = "\u001b[H";
const CLEAR = "\u001b[2J";
const CLEAR_BELOW = "\u001b[J";
/** Erase from the cursor to the end of the current line. */
const CLEAR_LINE = "\u001b[K";

export interface Key {
  /** The printable character, when there is one. */
  ch: string;
  /** Normalised name: "up", "down", "enter", "escape", "tab", "backspace"… */
  name: string;
  ctrl: boolean;
  shift: boolean;
}

export interface Size {
  cols: number;
  rows: number;
}

/**
 * A live terminal session. `run` owns it: nothing else should construct one,
 * because only `run` guarantees the matching teardown.
 */
export class Screen {
  private readonly out = process.stdout;
  private readonly input = process.stdin;
  private torndown = false;
  private lastFrame = "";

  /** Set when the app asks to exit, so the loop can unwind cleanly. */
  private resolveExit?: (code: number) => void;

  constructor() {
    this.out.write(ALT_ON + CURSOR_HIDE + CLEAR + CURSOR_HOME);
  }

  get size(): Size {
    // A terminal that reports nothing (a pipe, some CI runners) still needs
    // usable numbers or every layout computation divides by zero.
    return {
      cols: Math.max(this.out.columns || 80, 40),
      rows: Math.max(this.out.rows || 24, 10),
    };
  }

  /**
   * Paint a frame. Repeated identical frames are dropped: the render loop is
   * driven by key events, and a key that changes nothing should not cost a
   * repaint (which on a slow ssh link shows as a visible flash).
   *
   * Every line is followed by an erase-to-end-of-line, and that is the whole
   * trick. Overwriting a long line with a short one leaves the old tail on
   * screen, so a wide leaderboard row sits behind a narrow profile line and
   * the two read as one garbled row. A single erase-below at the end does not
   * help: it only clears rows past the last one drawn, never the right-hand
   * side of the rows just written.
   *
   * Lines are joined with CR+LF rather than LF alone. Raw mode leaves ONLCR on
   * under libuv today, so LF would usually still return to column 0 — but that
   * is a property of somebody else's terminal setup, and a frame that silently
   * staircases down the screen when it is off is not worth the two bytes.
   */
  paint(frame: string): void {
    if (this.torndown || frame === this.lastFrame) return;
    this.lastFrame = frame;
    const body = frame.split("\n").join(CLEAR_LINE + "\r\n") + CLEAR_LINE;
    this.out.write(CURSOR_HOME + body + CLEAR_BELOW);
  }

  /** Force the next paint to redraw even if the frame is unchanged. */
  invalidate(): void {
    this.lastFrame = "";
  }

  teardown(): void {
    if (this.torndown) return;
    this.torndown = true;
    if (this.input.isTTY) this.input.setRawMode(false);
    this.input.pause();
    this.out.write(CURSOR_SHOW + ALT_OFF);
  }

  /**
   * Ask the loop to unwind, with the status the process should exit on.
   *
   * Raw mode stops the terminal turning Ctrl-C into SIGINT — it arrives as an
   * ordinary keystroke instead — so an app that wants the conventional 130 has
   * to say so. Quitting with `q` is a clean 0.
   */
  exit(code = 0): void {
    this.resolveExit?.(code);
  }

  /** Internal: wired by `run`. */
  onExit(resolve: (code: number) => void): void {
    this.resolveExit = resolve;
  }
}

export interface AppContext {
  screen: Screen;
  /** Repaint from current state. Call after mutating anything on screen. */
  render: () => void;
}

export interface App {
  /** Produce the frame for the current state. */
  frame(size: Size): string;
  /** Handle a key. Return true if the frame needs repainting. */
  key(key: Key, ctx: AppContext): boolean | Promise<boolean>;
}

/**
 * Run an app until it exits, then restore the terminal.
 *
 * The ordering here is deliberate and load-bearing:
 *   1. teardown is registered on every exit path *before* setup happens,
 *   2. raw mode is entered before any output,
 *   3. the promise only resolves after teardown has run.
 *
 * Entering raw mode after writing is the bug that makes a menu echo the user's
 * arrow keys back at them as caret-notation escape sequences on the first
 * keypress.
 */
export async function run(app: App): Promise<number> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new NotATtyError();
  }

  const screen = new Screen();
  let finished = false;

  const teardown = () => {
    if (finished) return;
    finished = true;
    screen.teardown();
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
    process.off("exit", teardown);
    process.stdout.off("resize", onResize);
  };

  const onSignal = () => {
    teardown();
    // Re-raise the way a signal handler should: exit with 128+n so callers and
    // shells see an interrupted program rather than a clean one.
    process.exit(130);
  };

  process.on("exit", teardown);
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);

  const render = () => {
    if (!finished) screen.paint(app.frame(screen.size));
  };

  const onResize = () => {
    // Geometry changed under us, so the cached frame is meaningless.
    screen.invalidate();
    render();
  };
  process.stdout.on("resize", onResize);

  emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();

  const done = new Promise<number>((resolve) => screen.onExit(resolve));
  const ctx: AppContext = { screen, render };

  // Node delivers keypress events, but its parse of escape sequences is
  // incomplete and inconsistent across terminals, so the raw sequence wins
  // where the two disagree. See `decode`.
  const onKey = (ch: string | undefined, info: NodeKey | undefined) => {
    const key = decode(ch, info);
    if (!key) return;
    void Promise.resolve(app.key(key, ctx)).then((dirty) => {
      if (dirty) render();
    });
  };
  process.stdin.on("keypress", onKey);

  render();

  try {
    return await done;
  } finally {
    process.stdin.off("keypress", onKey);
    teardown();
  }
}

export class NotATtyError extends Error {
  constructor() {
    super("not a terminal");
    this.name = "NotATtyError";
  }
}

interface NodeKey {
  name?: string;
  ctrl?: boolean;
  shift?: boolean;
  meta?: boolean;
  sequence?: string;
}

/**
 * Normalise a keypress into something an app can switch on.
 *
 * Ctrl-C arrives as the raw byte 0x03 with no name attached on some terminals,
 * which is why it is matched on the sequence as well as the name: missing it
 * means the only way out of a full-screen app is to kill the shell.
 */
function decode(ch: string | undefined, info: NodeKey | undefined): Key | null {
  const seq = info?.sequence ?? ch ?? "";
  const ctrl = Boolean(info?.ctrl) || seq === "\u0003";
  let name = info?.name ?? "";

  if (seq === "\u0003") name = "c";
  else if (seq === "\r" || seq === "\n") name = "enter";
  else if (seq === "\u001b") name = "escape";
  else if (seq === "\u007f" || seq === "\b") name = "backspace";
  else if (!name && seq.length === 1) name = seq;

  if (!name) return null;

  return {
    ch: ch && ch.length === 1 && ch >= " " ? ch : "",
    name,
    ctrl,
    shift: Boolean(info?.shift),
  };
}
