import readline from "node:readline";
import { bold, cyan, dim } from "./ansi.js";

export class PromptCancelledError extends Error {
  constructor() {
    super("cancelled");
    this.name = "PromptCancelledError";
  }
}

function assertInteractive(): void {
  if (!process.stdin.isTTY) {
    throw new Error(
      "this command needs an interactive terminal; pass the value as a flag instead",
    );
  }
}

/**
 * Ask a free-text question.
 *
 * Deliberately readline-based rather than raw-mode: the values we ask for are
 * pasted far more often than typed, and readline handles a bracketed paste
 * correctly where character-by-character handling tends to mangle it.
 */
export function ask(question: string, placeholder?: string): Promise<string> {
  assertInteractive();
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const hint = placeholder ? dim(` ${placeholder}`) : "";
  const prompt = `  ${bold(question)}${hint}${dim(":")} `;

  return new Promise((resolve, reject) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
    rl.on("SIGINT", () => {
      rl.close();
      process.stdout.write("\n");
      reject(new PromptCancelledError());
    });
  });
}

/** Ask a yes/no question. Returns `defaultValue` on a bare Enter. */
export async function confirm(question: string, defaultValue = false): Promise<boolean> {
  const hint = defaultValue ? "Y/n" : "y/N";
  const answer = (await ask(`${question} ${dim(`(${hint})`)}`)).toLowerCase();
  if (answer === "") return defaultValue;
  return answer === "y" || answer === "yes";
}

/**
 * Normalise a pasted link code.
 *
 * People paste these with stray whitespace, in the wrong case, and with or
 * without the separating dash. Accept all of it and settle on ABCD-EFGH.
 */
export function normalizeCode(raw: string): string {
  const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (cleaned.length !== 8) return cleaned;
  return `${cleaned.slice(0, 4)}-${cleaned.slice(4)}`;
}

export function isValidCode(code: string): boolean {
  return /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code);
}

/**
 * Render a URL so terminals that support OSC 8 make it clickable.
 *
 * The BEL terminators are load-bearing. An OSC string runs until a
 * terminator, so without them the terminal swallows whatever follows as part
 * of the URL parameter: the newline after the link and the whole next line
 * disappeared. Written as escapes so a stripped control byte cannot bring the
 * bug back.
 */
export function link(url: string): string {
  if (!process.stdout.isTTY) return url;
  const open = `\u001b]8;;${url}\u0007`;
  const close = `\u001b]8;;\u0007`;
  return `${open}${cyan(url)}${close}`;
}
