import { db, DB_ID, Query } from "../client.ts";
import { totalsRowId } from "../ids.ts";
import { listUsage, summarize, type UsageSummary } from "./usage.ts";
import { findProfileById, listedFor } from "./profiles.ts";

/**
 * The leaderboard, served from a denormalised rollup.
 *
 * Ranking by scanning `usage_daily` would mean reading every row of every user
 * on every page load. Instead each sync recomputes that user's totals into one
 * row in `user_totals`, and the board is an indexed sort over that — one query
 * regardless of how much history anyone has.
 *
 * The rollup is derived data: it can always be rebuilt from `usage_daily`,
 * which stays the source of truth.
 */

/** Rollup rows per round trip. One row per user, so this is generous. */
const TOTALS_PAGE = 200;

export type Window = "all" | "30d" | "7d";
export type Metric = "cost" | "tokens";

export interface Totals {
  $id: string;
  userId: string;
  handle: string;
  handleLower: string;
  isPublic: boolean;
  listed: boolean;
  costUsd: number;
  costUsd7d: number;
  costUsd30d: number;
  tokens: number;
  requests: number;
  activeDays: number;
  firstDay?: string | null;
  lastDay?: string | null;
  topModel?: string | null;
  topTool?: string | null;
  toolCount: number;
  lastSyncAt?: string | null;
  updatedAt: string;
}

/** Recompute one user's rollup from their raw rows. Called after every sync. */
export async function refreshTotals(userId: string): Promise<UsageSummary> {
  const profile = await findProfileById(userId);
  if (!profile) throw new Error(`no profile ${userId}`);

  const rows = await listUsage(userId);
  const summary = summarize(rows);
  const now = new Date().toISOString();

  await db().upsertDocuments(DB_ID, "user_totals", [
    {
      $id: totalsRowId(userId),
      userId,
      handle: profile.handle,
      handleLower: profile.handleLower,
      isPublic: profile.isPublic !== false,
      listed: listedFor(profile),
      costUsd: round(summary.costUsd),
      costUsd7d: round(summary.costUsd7d),
      costUsd30d: round(summary.costUsd30d),
      tokens: summary.tokens,
      requests: summary.requests,
      activeDays: summary.activeDays,
      cacheRead: summary.cacheRead,
      cacheWrite: summary.cacheWrite,
      firstDay: summary.firstDay,
      lastDay: summary.lastDay,
      topModel: summary.topModel,
      topTool: summary.topTool,
      toolCount: summary.toolCount,
      lastSyncAt: now,
      updatedAt: now,
    },
  ] as never);

  return summary;
}

function round(value: number): number {
  return Number(value.toFixed(6));
}

const FIELD: Record<Window, Record<Metric, string>> = {
  all: { cost: "costUsd", tokens: "tokens" },
  "30d": { cost: "costUsd30d", tokens: "tokens" },
  "7d": { cost: "costUsd7d", tokens: "tokens" },
};

export interface LeaderboardEntry extends Totals {
  rank: number;
  value: number;
}

export async function leaderboard(
  options: { window?: Window; metric?: Metric; limit?: number } = {},
): Promise<LeaderboardEntry[]> {
  const window = options.window ?? "all";
  const metric = options.metric ?? "cost";
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 200);
  const field = FIELD[window][metric];

  const result = await db().listDocuments(DB_ID, "user_totals", [
    Query.equal("listed", true),
    Query.greaterThan(field, 0),
    Query.orderDesc(field),
    Query.limit(limit),
  ]);

  return (result.documents as unknown as Totals[]).map((row, index) => ({
    ...row,
    rank: index + 1,
    value: (row as unknown as Record<string, number>)[field] ?? 0,
  }));
}

/**
 * Every rollup row, one per user who has ever synced.
 *
 * This exists so the site-wide board can be built without touching
 * `usage_daily`. That table holds a row per (day, tool, model) bucket, so
 * scanning it to rank users cost one read per bucket per page view — which is
 * what exhausted a 1.75M monthly read quota on a few hundred page views. Here
 * the cost is one read per user.
 *
 * Paged rather than limited: the board seeds from profiles and fills from
 * these, so a truncated list would silently show people as having no usage.
 */
export async function listAllUserTotals(): Promise<Totals[]> {
  const out: Totals[] = [];
  let cursor: string | undefined;

  for (;;) {
    const queries = [Query.limit(TOTALS_PAGE), Query.orderAsc("$id")];
    if (cursor) queries.push(Query.cursorAfter(cursor));

    const page = await db().listDocuments(DB_ID, "user_totals", queries);
    const docs = page.documents as unknown as Totals[];
    for (const doc of docs) out.push(doc);

    if (docs.length < TOTALS_PAGE) break;
    cursor = docs[docs.length - 1]?.$id;
    if (!cursor) break;
  }

  return out;
}

/**
 * A user's position on the board.
 *
 * Counts how many public users score strictly higher — one indexed count
 * rather than materialising the whole board. Returns null for a user with no
 * usage, who does not appear at all.
 */
export async function rankOf(
  userId: string,
  options: { window?: Window; metric?: Metric } = {},
): Promise<number | null> {
  const field = FIELD[options.window ?? "all"][options.metric ?? "cost"];

  let totals: Totals;
  try {
    totals = (await db().getDocument(DB_ID, "user_totals", totalsRowId(userId))) as unknown as Totals;
  } catch {
    return null;
  }

  const value = (totals as unknown as Record<string, number>)[field] ?? 0;
  if (value <= 0) return null;

  const ahead = await db().listDocuments(DB_ID, "user_totals", [
    Query.equal("listed", true),
    Query.greaterThan(field, value),
    Query.limit(1),
  ]);

  return ahead.total + 1;
}

export async function getTotals(userId: string): Promise<Totals | null> {
  try {
    return (await db().getDocument(DB_ID, "user_totals", totalsRowId(userId))) as unknown as Totals;
  } catch {
    return null;
  }
}

/** Board-wide figures for a stats strip. */
export async function globalStats(): Promise<{
  users: number;
  costUsd: number;
  tokens: number;
  requests: number;
}> {
  let cursor: string | undefined;
  let users = 0;
  let costUsd = 0;
  let tokens = 0;
  let requests = 0;

  for (;;) {
    const queries = [Query.limit(100), Query.orderAsc("$id")];
    if (cursor) queries.push(Query.cursorAfter(cursor));

    const page = await db().listDocuments(DB_ID, "user_totals", queries);
    const docs = page.documents as unknown as Totals[];

    for (const row of docs) {
      users++;
      costUsd += row.costUsd ?? 0;
      tokens += row.tokens ?? 0;
      requests += row.requests ?? 0;
    }

    if (docs.length < 100) break;
    cursor = docs[docs.length - 1]?.$id;
    if (!cursor) break;
  }

  return { users, costUsd, tokens, requests };
}
