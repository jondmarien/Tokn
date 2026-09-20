import { bold, dim, sym } from "./ansi.js";
import { PromptCancelledError } from "./prompt.js";

/**
 * An arrow-key menu.
 *
 * Raw mode is worth it here where it is not for the link code: these are
 * single keystrokes, not pasted text, and a highlighted list reads far faster
 * than "type 1, 2 or 3". Falls back to a numbered prompt when stdin is not a
 * TTY, so the wizard still works over a pipe.
 */

export interface Choice<T> {
  value: T;
  label: string;
  /** Shown beside the label, greyed. */
  hint?: string;
}

export async function select<T>(
  question: string,
  choices: Choice<T>[],
  options: { initial?: number } = {},
): Promise<T> {
  const first = choices[0];
  if (!first) throw new Error("select() needs at least one choice");

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return first.value;
  }

  const out = process.stdout;
  let index = Math.min(Math.max(options.initial ?? 0, 0), choices.length - 1);

  // Raw mode before anything is printed. Any gap between drawing and taking
  // control of the tty is a window in which a keypress is echoed into the
  // output, which then corrupts the redraw.
  const stdin = process.stdin;
  const wasRaw = stdin.isRaw;
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");
  out.write("\u001b[?25l"); // hide cursor

  out.write(`\n  ${bold(question)}\n`);
  out.write(`  ${dim("↑↓ to move, enter to choose")}\n\n`);

  const draw = () => {
    for (const [i, choice] of choices.entries()) {
      const active = i === index;
      const pointer = active ? sym.arrow : " ";
      const label = active ? bold(choice.label) : choice.label;
      const hint = choice.hint ? `  ${dim(choice.hint)}` : "";
      out.write(`  ${active ? label.length > 0 ? pointer : pointer : dim(pointer)} ${label}${hint}\n`);
    }
  };

  const erase = () => {
    // Walk back up over the rows we drew and clear each one, so a redraw
    // replaces the list rather than stacking copies of it.
    out.write(`\u001b[${choices.length}A`);
    for (let i = 0; i < choices.length; i++) out.write("\u001b[2K\u001b[1B");
    out.write(`\u001b[${choices.length}A`);
  };

  draw();

  const restore = () => {
    out.write("\u001b[?25h");
    stdin.setRawMode(wasRaw ?? false);
    stdin.pause();
  };

  return new Promise<T>((resolve, reject) => {
    const onKey = (key: string) => {
      if (key === "\u0003") {
        // Ctrl-C. Written as an escape rather than a literal 0x03: a raw
        // control byte in source does not survive every transport, and what
        // is left behind compares against "" and never matches.
        stdin.off("data", onKey);
        restore();
        out.write("\n");
        reject(new PromptCancelledError());
        return;
      }

      if (key === "\r" || key === "\n") {
        stdin.off("data", onKey);
        restore();
        resolve(choices[index]!.value);
        return;
      }

      const previous = index;
      if (key === "\u001b[A" || key === "k") index = (index - 1 + choices.length) % choices.length;
      else if (key === "\u001b[B" || key === "j") index = (index + 1) % choices.length;
      else {
        // Number keys jump straight to a row.
        const n = Number.parseInt(key, 10);
        if (Number.isFinite(n) && n >= 1 && n <= choices.length) index = n - 1;
      }

      if (index !== previous) {
        erase();
        draw();
      }
    };

    stdin.on("data", onKey);
  });
}

/** A yes/no built on the same menu, so the whole wizard feels consistent. */
export async function confirmChoice(
  question: string,
  options: { yes?: string; no?: string; initial?: boolean } = {},
): Promise<boolean> {
  return select<boolean>(
    question,
    [
      { value: true, label: options.yes ?? "yes" },
      { value: false, label: options.no ?? "no" },
    ],
    { initial: options.initial === false ? 1 : 0 },
  );
}
