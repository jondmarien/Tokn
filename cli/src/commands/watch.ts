import { open } from "node:fs/promises";
import { discoverSessions } from "../core/discover.js";
import { parseUsageLine } from "../core/parse.js";
import { aggregate } from "../core/aggregate.js";
import { loadConfig } from "../core/config.js";
import { totalTokens } from "../core/pricing.js";
import { localDay } from "../core/sources/types.js";
import { runScan, NoSessionsError } from "../core/run-scan.js";
import { bold, dim, green, sym } from "../ui/ansi.js";
import { compactNumber, duration, fullNumber, money2 } from "../ui/format.js";
import type { ParsedArgs } from "../args.js";
import type { SessionFile } from "../core/discover.js";
import type { UsageEvent } from "../core/sources/types.js";

/**
 * `tokn watch` — what this is costing, while it is costing it.
 *
 * Every other view in this tool is retrospective: you learn what you spent
 * after you finished spending it. This is the only one that reports a number
 * while there is still a decision to make about it, which is the difference
 * between a dashboard and a tool.
 *
 * ## How it follows a live session
 *
 * Transcripts are append-only JSONL, so the cheap way to follow them is to
 * remember each file's size and read only what arrives after it. Starting
 * offsets are the sizes at launch, so the meter counts *this sitting* rather
 * than replaying history it was not watching.
 *
 * Re-discovery runs on every tick because a new session opens a new file, and
 * a watcher that only knows the files that existed at startup goes quiet the
 * moment you start a fresh conversation.
 *
 * Parsing goes through `parseUsageLine`, the same function the full scan uses.
 * A tail with its own copy of the dedupe and synthetic-model rules would
 * disagree with `tokn scan` about the same money, and the one thing a live
 * meter cannot afford is to be a second opinion.
 */

const TICK_MS = 1500;
/** A candidate line has to contain this before it is worth decoding. */
const USAGE_HINT = '"usage"';

interface Tail {
  offset: number;
  mtimeMs: number;
  source: SessionFile["source"];
}

export async function watchCommand(args: ParsedArgs): Promise<number> {
  const out = process.stdout;
  const config = await loadConfig();
  const pricing = config.pricing?.models;

  if (!process.stdout.isTTY) {
    out.write(
      `\n  ${dim("tokn watch needs a terminal. Use")} ${bold("tokn scan")} ${dim("for one-shot output.")}\n\n`,
    );
    return 1;
  }

  /* --------------------------------------------------- today, as a baseline */

  // `localDay`, not `toISOString`. The parser buckets every event by local
  // calendar day, so a UTC date is a different day for most of the planet for
  // part of every day — west of UTC this asked for tomorrow and the baseline
  // came back as $0.00 with a full day of spending sitting right there.
  const today = localDay(new Date());
  let baseline = 0;
  try {
    const scan = await runScan({ since: today, pricing, quiet: false });
    baseline = scan.aggregation.totals.cost.total;
  } catch (error) {
    if (!(error instanceof NoSessionsError)) throw error;
  }

  /* ------------------------------------------------------- start the tails */

  const tails = new Map<string, Tail>();
  const seen = new Set<string>();
  const startedAt = Date.now();

  const discover = async (first: boolean) => {
    const { files } = await discoverSessions();
    for (const file of files) {
      const known = tails.get(file.path);
      if (known) {
        known.mtimeMs = file.mtimeMs;
        continue;
      }
      tails.set(file.path, {
        // Skip what is already on disk. A file only counts from byte zero when
        // it was actually written after the watch began: "appeared on a later
        // tick" is not the same as "is new". A transcript that existed all
        // along and was simply missed by the first walk would otherwise have
        // its entire history counted as this sitting, and the meter would jump
        // by hundreds of dollars for work done last week.
        offset: first || file.mtimeMs <= startedAt ? file.size : 0,
        mtimeMs: file.mtimeMs,
        source: file.source,
      });
    }
  };
  await discover(true);

  const events: UsageEvent[] = [];
  let lastEventAt: number | null = null;
  let stopping = false;

  const readNew = async (path: string, tail: Tail): Promise<void> => {
    const handle = await open(path, "r");
    try {
      const { size } = await handle.stat();
      if (size <= tail.offset) {
        // Truncated or rotated: start over rather than read from past the end.
        if (size < tail.offset) tail.offset = 0;
        return;
      }

      const length = size - tail.offset;
      const buffer = Buffer.allocUnsafe(length);
      const { bytesRead } = await handle.read(buffer, 0, length, tail.offset);
      const text = buffer.toString("utf8", 0, bytesRead);

      // A tick can land mid-line. Keep the remainder for next time by only
      // advancing past the last newline actually seen.
      const lastBreak = text.lastIndexOf("\n");
      if (lastBreak === -1) return;
      tail.offset += Buffer.byteLength(text.slice(0, lastBreak + 1), "utf8");

      for (const line of text.slice(0, lastBreak).split("\n")) {
        if (!line.includes(USAGE_HINT)) continue;
        const result = parseUsageLine(line, { source: tail.source, mtimeMs: tail.mtimeMs }, seen);
        if (result.event) {
          events.push(result.event);
          lastEventAt = Date.now();
        }
      }
    } finally {
      await handle.close();
    }
  };

  /* ------------------------------------------------------------- the meter */

  let lastLine = "";
  const paint = () => {
    const summary = aggregate(events, pricing);
    const spent = summary.totals.cost.total;
    const model = summary.byModel[0]?.model ?? "";
    const idle = lastEventAt ? Date.now() - lastEventAt : null;

    const parts = [
      `${green(sym.bullet)} ${bold(money2(spent))}`,
      dim(`${fullNumber(summary.totals.requests)} req`),
      dim(compactNumber(totalTokens(summary.totals.tokens))),
      model ? dim(model) : "",
      dim(`today ${money2(baseline + spent)}`),
      // Silence is information: it distinguishes "nothing is happening" from
      // "this has stopped working".
      idle !== null && idle > 30_000 ? dim(`idle ${duration(idle)}`) : "",
    ].filter(Boolean);

    const line = `  ${parts.join(dim("  ·  "))}`;
    if (line === lastLine) return;
    lastLine = line;
    out.write("\r\u001b[2K" + line);
  };

  out.write(`\n  ${bold("Watching this session")}   ${dim("ctrl-c to stop")}\n`);
  out.write(`  ${dim(`today so far: ${money2(baseline)}`)}\n\n`);
  out.write("\u001b[?25l"); // hide cursor

  const finish = (): void => {
    if (stopping) return;
    stopping = true;
    out.write("\u001b[?25h"); // restore cursor

    const summary = aggregate(events, pricing);
    const spent = summary.totals.cost.total;
    out.write("\r\u001b[2K");
    out.write(
      `\n  ${green(sym.tick)} ${bold(money2(spent))} ${dim("over")} ${dim(duration(Date.now() - startedAt))}` +
        ` ${dim(sym.bullet)} ${dim(`${fullNumber(summary.totals.requests)} requests`)}` +
        ` ${dim(sym.bullet)} ${dim(`today ${money2(baseline + spent)}`)}\n\n`,
    );
  };

  process.on("SIGINT", () => {
    finish();
    process.exit(0);
  });

  paint();
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, TICK_MS));
    if (stopping) break;

    await discover(false);
    for (const [path, tail] of tails) {
      try {
        await readNew(path, tail);
      } catch {
        // A session file can vanish mid-watch. Losing one tick of one file is
        // not worth ending the watch over.
      }
    }
    paint();
  }

  return 0;
}
