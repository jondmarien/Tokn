import { scanLines } from "../lines.js";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { emptyTokens } from "../pricing.js";
import { localDay, newestMtime, num, type CollectOptions, type Source, type SourceAvailability, type UsageEvent } from "./types.js";

/**
 * OpenAI Codex CLI.
 *
 * Codex writes rollout transcripts to `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`.
 * Token accounting arrives as an `event_msg` whose payload type is `token_count`,
 * carrying a cumulative `total_token_usage` and a per-turn `last_token_usage`.
 *
 * We read `last_token_usage` and sum it, because the cumulative figure restarts
 * per session and would double-count if added across turns. Where only the
 * cumulative total is present we take the final value per session instead.
 *
 * The model is not on the usage event itself; it comes from the session's
 * `turn_context` (or `session_meta`), so we track the most recent one seen.
 */

function sessionsDir(): string {
  return path.join(process.env.CODEX_HOME ?? path.join(os.homedir(), ".codex"), "sessions");
}

async function listTranscripts(dir: string, depth = 0): Promise<string[]> {
  if (depth > 6) return [];
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const out: string[] = [];
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await listTranscripts(full, depth + 1)));
    else if (entry.isFile() && entry.name.endsWith(".jsonl")) out.push(full);
  }
  return out;
}

interface CodexRecord {
  type?: string;
  timestamp?: string;
  payload?: {
    type?: string;
    model?: string;
    info?: {
      last_token_usage?: TokenUsage;
      total_token_usage?: TokenUsage;
      model_context_window?: number;
    };
    // turn_context carries the model for the turns that follow
    [key: string]: unknown;
  };
}

interface TokenUsage {
  input_tokens?: number;
  cached_input_tokens?: number;
  output_tokens?: number;
  reasoning_output_tokens?: number;
  total_tokens?: number;
}

export const codexSource: Source = {
  id: "codex",
  name: "Codex CLI",

  async detect(): Promise<SourceAvailability> {
    const files = await listTranscripts(sessionsDir());
    return files.length > 0 ? { state: "ready" } : { state: "absent" };
  },

  async lastActivity(): Promise<number> {
    return newestMtime(await listTranscripts(sessionsDir()));
  },

  async collect(options: CollectOptions) {
    const events: UsageEvent[] = [];
    const stats = { events: 0, duplicates: 0, failures: 0, detail: undefined as string | undefined };

    const files = await listTranscripts(sessionsDir());
    if (files.length === 0) return { events, stats };

    for (const file of files) {
      try {
        await readTranscript(file, events, options);
      } catch {
        stats.failures++;
      }
    }

    stats.events = events.length;
    stats.detail = `${files.length} ${files.length === 1 ? "transcript" : "transcripts"}`;
    return { events, stats };
  },
};

/** Codex records that matter name a model or carry a token count. */
const CODEX_MARKERS = [Buffer.from("token"), Buffer.from("model")];

async function readTranscript(
  file: string,
  events: UsageEvent[],
  options: CollectOptions,
): Promise<void> {
  let model = "";
  let fallbackTotal: { usage: TokenUsage; timestamp: string } | null = null;
  let sawPerTurn = false;

  // Only lines that could mention a token count or a model are worth decoding;
  // the rest of a Codex transcript is conversation.
  await scanLines(file, CODEX_MARKERS, (line) => {
    let record: CodexRecord;
    try {
      record = JSON.parse(line) as CodexRecord;
    } catch {
      return;
    }

    const payload = record.payload;
    if (!payload) return;

    // Any record that names a model updates the current model.
    const named = typeof payload.model === "string" ? payload.model : undefined;
    if (named) model = named;

    if (record.type !== "event_msg" || payload.type !== "token_count") return;

    const info = payload.info;
    if (!info) return;

    const timestamp = record.timestamp ?? new Date().toISOString();
    const day = localDay(timestamp);
    if (day === "unknown") return;

    const perTurn = info.last_token_usage;
    if (perTurn && (num(perTurn.input_tokens) > 0 || num(perTurn.output_tokens) > 0)) {
      sawPerTurn = true;
      if (!options.since || day >= options.since) {
        events.push(toEvent(model, perTurn, day, timestamp));
      }
    } else if (info.total_token_usage) {
      // Keep the last cumulative reading as a fallback for transcripts that
      // never report per-turn figures.
      fallbackTotal = { usage: info.total_token_usage, timestamp };
    }
  });

  // Runs once the whole file has been read, not per line: a transcript that
  // never reported per-turn figures contributes its final cumulative reading
  // instead, and that is only known at the end.
  if (!sawPerTurn && fallbackTotal) {
    const total: { usage: TokenUsage; timestamp: string } = fallbackTotal;
    const day = localDay(total.timestamp);
    if (day !== "unknown" && (!options.since || day >= options.since)) {
      events.push(toEvent(model, total.usage, day, total.timestamp));
    }
  }
}

function toEvent(model: string, usage: TokenUsage, day: string, timestamp: string): UsageEvent {
  const tokens = emptyTokens();
  const cached = num(usage.cached_input_tokens);
  // Codex reports total input including the cached portion; split them so the
  // cached share is priced at the cache-read rate.
  tokens.input = Math.max(0, num(usage.input_tokens) - cached);
  tokens.cacheRead = cached;
  tokens.output = num(usage.output_tokens);
  // reasoning_output_tokens is a subset of output_tokens — not added.

  return { tool: "codex", model: model || "unknown", day, timestamp, tokens };
}
