import { scanLines } from "./lines.js";
import type { SessionFile } from "./discover.js";
import { emptyTokens, type TokenCounts } from "./pricing.js";
import { localDay, num, type UsageEvent } from "./sources/types.js";

/**
 * Streaming reader for Claude transcript files (Claude Code and Claude Desktop
 * share this format).
 *
 * Transcripts are append-only JSONL and can reach tens of megabytes, so every
 * file is read line by line and never buffered whole.
 *
 * The critical correctness concern is duplication. Claude Code re-writes
 * assistant records into a new transcript whenever a session is resumed or
 * forked, and subagent turns are copied into the parent transcript too. On a
 * real machine roughly half of all usage records are repeats — a scanner that
 * trusts the raw records reports about twice the true spend. Every record is
 * therefore keyed on the API's own identifiers, `message.id` paired with
 * `requestId`, and counted at most once per scan.
 */

export interface ScanStats {
  filesRead: number;
  filesFailed: number;
  linesRead: number;
  usageRecords: number;
  duplicatesSkipped: number;
  syntheticSkipped: number;
  unkeyedRecords: number;
}

export function emptyStats(): ScanStats {
  return {
    filesRead: 0,
    filesFailed: 0,
    linesRead: 0,
    usageRecords: 0,
    duplicatesSkipped: 0,
    syntheticSkipped: 0,
    unkeyedRecords: 0,
  };
}

interface RawRecord {
  type?: string;
  timestamp?: string;
  requestId?: string;
  /** Present on every usage-carrying record Claude Code writes. */
  cwd?: string;
  gitBranch?: string;
  sessionId?: string;
  message?: {
    id?: string;
    model?: string;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
      cache_creation?: {
        ephemeral_5m_input_tokens?: number;
        ephemeral_1h_input_tokens?: number;
      };
      speed?: string;
    };
  };
}

/**
 * Records with `model: "<synthetic>"` are produced locally by the client (an
 * interrupt notice, for example). They were never sent to the API.
 */
/** Any record carrying token counts contains this. Matched on bytes. */
const USAGE_MARKER = Buffer.from('"usage"');

const SYNTHETIC_MODEL = "<synthetic>";

export interface ParseOptions {
  since?: string;
  onProgress?: (filesDone: number, total: number) => void;
}

export async function parseSessions(
  files: SessionFile[],
  options: ParseOptions = {},
): Promise<{ events: UsageEvent[]; stats: ScanStats }> {
  const stats = emptyStats();
  const events: UsageEvent[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (!file) continue;

    try {
      await parseOneFile(file, events, seen, stats, options);
      stats.filesRead++;
    } catch {
      stats.filesFailed++;
    }

    options.onProgress?.(i + 1, files.length);
  }

  events.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  return { events, stats };
}

async function parseOneFile(
  file: SessionFile,
  events: UsageEvent[],
  seen: Set<string>,
  stats: ScanStats,
  options: ParseOptions,
): Promise<void> {
  // The marker test happens on raw bytes inside `scanLines`, which is what
  // keeps roughly 90% of these files from ever becoming JavaScript strings.
  // Only lines that could carry usage reach this callback.
  const scan = await scanLines(file.path, USAGE_MARKER, (line) => {
    let record: RawRecord;
    try {
      record = JSON.parse(line) as RawRecord;
    } catch {
      return; // A torn final line while a session is being written.
    }

    if (record.type !== "assistant") return;

    const message = record.message;
    const usage = message?.usage;
    if (!message || !usage) return;

    const model = message.model;
    if (!model) return;

    if (model === SYNTHETIC_MODEL) {
      stats.syntheticSkipped++;
      return;
    }

    stats.usageRecords++;

    const messageId = message.id;
    const requestId = record.requestId;
    if (messageId || requestId) {
      const key = `${messageId ?? ""}:${requestId ?? ""}`;
      if (seen.has(key)) {
        stats.duplicatesSkipped++;
        return;
      }
      seen.add(key);
    } else {
      stats.unkeyedRecords++;
    }

    const timestamp = record.timestamp ?? new Date(file.mtimeMs).toISOString();
    const day = localDay(timestamp);
    if (options.since && day < options.since) return;

    events.push({
      tool: file.source,
      model,
      day,
      timestamp,
      fast: usage.speed === "fast",
      tokens: splitTokens(usage),
      // Kept for the local views and stripped by `aggregate` before any
      // upload. Undefined for tools that record none of them.
      project: record.cwd,
      branch: record.gitBranch,
      session: record.sessionId,
    });
  });

  // `linesRead` still counts every line in the file, decoded or not, so the
  // figure the scan reports means what it always meant.
  stats.linesRead += scan.linesRead;
}

/**
 * Split a usage block into the buckets we price separately.
 *
 * `cache_creation` carries the 5m/1h breakdown. Older client versions omit it,
 * leaving only the combined `cache_creation_input_tokens`; we attribute that to
 * the 5-minute bucket so an unknown split is priced at the lower rate rather
 * than inflating the total.
 */
function splitTokens(usage: NonNullable<NonNullable<RawRecord["message"]>["usage"]>): TokenCounts {
  const tokens = emptyTokens();
  tokens.input = num(usage.input_tokens);
  tokens.output = num(usage.output_tokens);
  tokens.cacheRead = num(usage.cache_read_input_tokens);

  const breakdown = usage.cache_creation;
  const w5 = num(breakdown?.ephemeral_5m_input_tokens);
  const w1h = num(breakdown?.ephemeral_1h_input_tokens);

  if (w5 > 0 || w1h > 0) {
    tokens.cacheWrite5m = w5;
    tokens.cacheWrite1h = w1h;
  } else {
    tokens.cacheWrite5m = num(usage.cache_creation_input_tokens);
  }

  return tokens;
}
