/**
 * A small argument parser.
 *
 * Hand-rolled rather than pulled from npm: the surface is tiny, and it keeps
 * the CLI at zero runtime dependencies so `npm i -g tokn` stays instant.
 */

export interface ParsedArgs {
  command: string | undefined;
  positionals: string[];
  flags: Record<string, string | boolean>;
}

/** Flags that consume the following token when not written as `--flag=value`. */
const VALUE_FLAGS = new Set(["code", "since", "last", "host", "tool", "every"]);

export class ArgError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArgError";
  }
}

export function parseArgs(argv: string[]): ParsedArgs {
  const flags: Record<string, string | boolean> = {};
  const positionals: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === undefined) continue;

    if (arg === "--") {
      positionals.push(...argv.slice(i + 1).filter((v): v is string => v !== undefined));
      break;
    }

    if (arg.startsWith("--")) {
      const body = arg.slice(2);
      const eq = body.indexOf("=");

      if (eq !== -1) {
        flags[body.slice(0, eq)] = body.slice(eq + 1);
        continue;
      }

      // `--no-browser` reads as an explicit false.
      if (body.startsWith("no-")) {
        flags[body.slice(3)] = false;
        continue;
      }

      if (VALUE_FLAGS.has(body)) {
        const next = argv[i + 1];
        if (next === undefined || next.startsWith("-")) {
          throw new ArgError(`--${body} needs a value`);
        }
        flags[body] = next;
        i++;
        continue;
      }

      flags[body] = true;
      continue;
    }

    if (arg.startsWith("-") && arg.length > 1) {
      for (const ch of arg.slice(1)) {
        const long = SHORT_FLAGS[ch];
        if (!long) throw new ArgError(`unknown flag -${ch}`);
        flags[long] = true;
      }
      continue;
    }

    positionals.push(arg);
  }

  return { command: positionals[0], positionals: positionals.slice(1), flags };
}

const SHORT_FLAGS: Record<string, string> = {
  h: "help",
  v: "version",
  y: "yes",
};

/**
 * Resolve `--since YYYY-MM-DD` / `--last N` into a starting day.
 *
 * Shared by `scan` and `sync` so that a range flag cannot be honoured by one
 * and silently dropped by the other.
 */
export function resolveSince(args: ParsedArgs): string | undefined {
  const since = args.flags.since;
  if (typeof since === "string") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(since)) {
      throw new ArgError("--since expects a date like 2026-09-01");
    }
    return since;
  }

  const last = args.flags.last;
  if (typeof last === "string") {
    const days = Number.parseInt(last, 10);
    if (!Number.isFinite(days) || days < 1) {
      throw new ArgError("--last expects a positive number of days");
    }
    const from = new Date();
    from.setDate(from.getDate() - (days - 1));
    const y = from.getFullYear();
    const m = String(from.getMonth() + 1).padStart(2, "0");
    const d = String(from.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  return undefined;
}
