import "server-only";
import {
  listAllProfiles,
  listAllUsage,
  listAllUserTotals,
  listDevices,
  listUsage,
  listedFor,
  type Profile,
  type Totals,
  type UsageDoc,
} from "./backend";

/**
 * Every read the pages make — backed by Appwrite.
 *
 * Appwrite has no `GROUP BY` and no `SUM`, so the aggregation that used to be
 * SQL now happens here in memory over the raw rows. Two consequences worth
 * knowing:
 *
 *   - Board-wide functions load every usage row. That is fine at current scale
 *     and deliberately not a long-term plan; past a few thousand active users
 *     the leaderboard should read the `user_totals` rollup the backend already
 *     maintains on every sync.
 *   - A short in-process cache keeps one page render from fetching the same
 *     rows several times over.
 *
 * Days are plain `YYYY-MM-DD` strings in the reporter's own timezone, which is
 * what the CLI uploads. Comparing them as strings is therefore correct.
 *
 * Exported names and shapes match the SQLite layer this replaced; the only
 * change for callers is that the data functions are now async.
 */

export type Period = "day" | "week" | "month" | "year" | "all";

export const PERIODS: { key: Period; label: string }[] = [
  { key: "day", label: "day" },
  { key: "week", label: "week" },
  { key: "month", label: "month" },
  { key: "year", label: "3 months" },
  { key: "all", label: "all time" },
];

export function isPeriod(value: string | undefined): value is Period {
  return (
    value === "day" ||
    value === "week" ||
    value === "month" ||
    value === "year" ||
    value === "all"
  );
}

export function today(): string {
  return toDay(new Date());
}

export function toDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function shiftDay(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return toDay(date);
}

/** Inclusive lower bound for a period, or null for all-time. */
export function periodStart(period: Period, from = today()): string | null {
  switch (period) {
    case "day":
      return from;
    case "week":
      return shiftDay(from, -6);
    case "month":
      return shiftDay(from, -29);
    case "year":
      return shiftDay(from, -89);
    case "all":
      return null;
  }
}

/* ------------------------------------------------------------------ cache */

/**
 * Next renders a page across several server components, each calling in here.
 * Without this they would each re-fetch the whole table. Deliberately short:
 * stale figures on a leaderboard are worse than a little extra latency.
 */
const TTL_MS = 5_000;

let cache: { at: number; usage: UsageDoc[]; profiles: Profile[] } | null = null;

async function snapshot(): Promise<{ usage: UsageDoc[]; profiles: Profile[] }> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache;
  const [usage, profiles] = await Promise.all([
    listAllUsage(),
    listAllProfiles(),
  ]);
  cache = { at: Date.now(), usage, profiles };
  return cache;
}

const tokensOf = (row: UsageDoc): number =>
  row.input + row.output + row.cacheWrite5m + row.cacheWrite1h + row.cacheRead;

const inWindow = (
  row: UsageDoc,
  start: string | null,
  until?: string,
): boolean => (!start || row.day >= start) && (!until || row.day <= until);

/* ----------------------------------------------------------- leaderboard */

export type Metric = "cost" | "tokens" | "requests";

export const METRICS: { key: Metric; label: string }[] = [
  { key: "cost", label: "cost" },
  { key: "tokens", label: "tokens" },
  { key: "requests", label: "requests" },
];

export function isMetric(value: string | undefined): value is Metric {
  return value === "cost" || value === "tokens" || value === "requests";
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  handle: string;
  name: string | null;
  joined: string;
  billing: string;
  cost: number;
  tokens: number;
  requests: number;
  days: number;
  topModel: string | null;
  lastDay: string | null;
}

export interface BoardOptions {
  /** Inclusive upper bound on `day`, for reconstructing an earlier board. */
  until?: string;
  /**
   * Drop accounts with nothing in the window.
   *
   * The board proper ranks everyone who signed up, but a "top ten this month"
   * highlight is a different question, and padding it with dashes when fewer
   * than ten people were active says nothing.
   */
  activeOnly?: boolean;
  /**
   * How many ranked rows to skip, for paging.
   *
   * Ranks are assigned before the slice, so page two starts at 16 rather than
   * restarting at 1.
   */
  offset?: number;
}

/**
 * A board built from the `user_totals` rollup instead of the raw rows.
 *
 * `usage_daily` holds one row per (day, tool, model) bucket, so ranking users
 * by scanning it costs one read per bucket on every page view. At a few
 * thousand buckets that is a whole monthly read quota inside a few hundred
 * views, which is how this site went down. The rollup is one row per user and
 * is already refreshed on every sync, so the same board costs one read each.
 *
 * Only all-time is served this way. The rollup carries `costUsd7d` and
 * `costUsd30d` but no windowed token or request counts, and nothing that can
 * reconstruct an earlier board, so every other period still reads the rows.
 * Approximating them would be worse than being slow: a board is a ranking, and
 * a ranking that is quietly wrong is not worth having.
 */
async function boardFromTotals(
  metric: Metric,
  { activeOnly, offset, limit }: { activeOnly: boolean; offset: number; limit: number },
): Promise<LeaderboardEntry[]> {
  const [totals, profiles] = await Promise.all([listAllUserTotals(), listAllProfiles()]);
  const byUser = new Map<string, Totals>(totals.map((row) => [row.userId, row]));

  const entries: LeaderboardEntry[] = [];
  for (const profile of profiles) {
    // Same rule as the scanning path: everyone who signed up gets a row, and
    // private or opted-out accounts are not ranked.
    if (!listedFor(profile)) continue;
    const row = byUser.get(profile.$id);

    entries.push({
      rank: 0,
      userId: profile.$id,
      handle: profile.handle,
      name: profile.name ?? null,
      joined: profile.createdAt,
      billing: profile.billing,
      cost: row?.costUsd ?? 0,
      tokens: row?.tokens ?? 0,
      requests: row?.requests ?? 0,
      days: row?.activeDays ?? 0,
      topModel: row?.topModel ?? null,
      lastDay: row?.lastDay ?? null,
    });
  }

  return rankAndSlice(entries, metric, { activeOnly, offset, limit });
}

export async function leaderboard(
  period: Period,
  metric: Metric,
  limit = 100,
  { until, activeOnly = false, offset = 0 }: BoardOptions = {},
): Promise<LeaderboardEntry[]> {
  // The default view, and so nearly all traffic, crawlers included.
  if (period === "all" && !until) {
    return boardFromTotals(metric, { activeOnly, offset, limit });
  }

  const { usage, profiles } = await snapshot();
  const start = periodStart(period, until);

  interface Acc {
    cost: number;
    tokens: number;
    requests: number;
    days: Set<string>;
    lastDay: string | null;
    models: Map<string, number>;
  }

  const byUser = new Map<string, Acc>();
  const blank = (): Acc => ({
    cost: 0,
    tokens: 0,
    requests: 0,
    days: new Set(),
    lastDay: null,
    models: new Map(),
  });

  // Everyone who signed up gets a row, whether or not they have ever synced.
  // Seeding from profiles rather than from usage is the whole difference: a
  // new account is on the board from the moment it exists, at the bottom,
  // which is a truer picture of the population than hiding it until it has
  // something to report.
  //
  // Reconstructing an earlier board (`until`) only seeds accounts that already
  // existed then, so someone who joined this week is genuinely new rather than
  // apparently motionless.
  for (const profile of profiles) {
    if (!listedFor(profile)) continue;
    if (until && profile.createdAt.slice(0, 10) > until) continue;
    byUser.set(profile.$id, blank());
  }

  for (const row of usage) {
    if (!inWindow(row, start, until)) continue;

    let acc = byUser.get(row.userId);
    if (!acc) {
      // Usage with no seeded profile: deleted, private, or opted out. Skipped
      // below; the totals strip still counts it anonymously.
      acc = blank();
      byUser.set(row.userId, acc);
    }

    acc.cost += row.costUsd;
    acc.tokens += tokensOf(row);
    acc.requests += row.requests;
    acc.days.add(row.day);
    if (!acc.lastDay || row.day > acc.lastDay) acc.lastDay = row.day;
    acc.models.set(row.model, (acc.models.get(row.model) ?? 0) + row.costUsd);
  }

  const profileById = new Map(profiles.map((p) => [p.$id, p]));

  const entries: LeaderboardEntry[] = [];

  for (const [userId, acc] of byUser) {
    const profile = profileById.get(userId);
    // A user whose profile was deleted but whose rows survived: skip rather
    // than render a blank row.
    if (!profile) continue;
    // Private accounts, and public ones that opted out, are not ranked. Their
    // usage still counts toward the anonymous site-wide totals.
    if (!listedFor(profile)) continue;

    // Ties on spend break by model name, matching the old SQL.
    const topModel =
      [...acc.models.entries()].sort(
        (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
      )[0]?.[0] ?? null;

    entries.push({
      rank: 0,
      userId,
      handle: profile.handle,
      name: profile.name ?? null,
      joined: profile.createdAt,
      billing: profile.billing,
      cost: acc.cost,
      tokens: acc.tokens,
      requests: acc.requests,
      days: acc.days.size,
      topModel,
      lastDay: acc.lastDay,
    });
  }

  return rankAndSlice(entries, metric, { activeOnly, offset, limit });
}

/** The ordering the board has always used, shared by both read paths. */
function rankAndSlice(
  entries: LeaderboardEntry[],
  metric: Metric,
  { activeOnly, offset, limit }: { activeOnly: boolean; offset: number; limit: number },
): LeaderboardEntry[] {
  return entries
    .filter((entry) => !activeOnly || entry[metric] > 0)
    .sort(
      (a, b) =>
        b[metric] - a[metric] ||
        // Everyone yet to report ties at zero, and ordering that block by name
        // would read as a ranking it is not. Longest-standing account first is
        // at least a fact about them.
        a.joined.localeCompare(b.joined) ||
        a.handle.localeCompare(b.handle),
    )
    .map((entry, index) => ({ ...entry, rank: index + 1 }))
    .slice(offset, offset + limit);
}

/**
 * Where everyone sat on the board a week ago, so each row can show which way it
 * is moving. A week is short enough to feel live and long enough that ordinary
 * daily noise does not make every row flicker.
 */
export const MOVEMENT_LOOKBACK_DAYS = 7;

export async function previousRanks(
  period: Period,
  metric: Metric,
): Promise<Map<string, number>> {
  const until = shiftDay(today(), -MOVEMENT_LOOKBACK_DAYS);
  const earlier = await leaderboard(period, metric, 100_000, { until });
  return new Map(earlier.map((entry) => [entry.userId, entry.rank]));
}

/** The per-model spend split for every user, for the mix bar in each row. */
export async function modelMix(
  period: Period,
): Promise<Map<string, { model: string; cost: number }[]>> {
  const { usage } = await snapshot();
  const start = periodStart(period);

  const byUser = new Map<string, Map<string, number>>();
  for (const row of usage) {
    if (!inWindow(row, start)) continue;
    let models = byUser.get(row.userId);
    if (!models) {
      models = new Map();
      byUser.set(row.userId, models);
    }
    models.set(row.model, (models.get(row.model) ?? 0) + row.costUsd);
  }

  const mix = new Map<string, { model: string; cost: number }[]>();
  for (const [userId, models] of byUser) {
    mix.set(
      userId,
      [...models.entries()]
        .map(([model, cost]) => ({ model, cost }))
        .sort((a, b) => b.cost - a.cost),
    );
  }
  return mix;
}

/** A short daily-cost series per user, for the sparkline in each row. */
export async function recentSeries(days = 14): Promise<Map<string, number[]>> {
  const { usage } = await snapshot();
  const start = shiftDay(today(), -(days - 1));

  // Days with no usage have no row, and a gap would misdraw the line, so every
  // series is built over a dense window.
  const window = Array.from({ length: days }, (_, index) =>
    shiftDay(start, index),
  );
  const index = new Map(window.map((day, position) => [day, position]));

  const series = new Map<string, number[]>();
  for (const row of usage) {
    if (row.day < start) continue;
    const position = index.get(row.day);
    if (position === undefined) continue;

    let values = series.get(row.userId);
    if (!values) {
      values = new Array<number>(days).fill(0);
      series.set(row.userId, values);
    }
    values[position] = (values[position] ?? 0) + row.costUsd;
  }

  return series;
}

/** Percent change between the last half of a series and the half before it. */
export function trend(values: number[] | undefined): number | null {
  if (!values || values.length < 4) return null;

  const half = Math.floor(values.length / 2);
  const earlier = values.slice(0, half).reduce((sum, value) => sum + value, 0);
  const later = values.slice(half).reduce((sum, value) => sum + value, 0);

  if (earlier <= 0) return later > 0 ? 100 : null;
  return ((later - earlier) / earlier) * 100;
}

export async function rankOf(
  userId: string,
  period: Period,
  metric: Metric,
): Promise<number | null> {
  const all = await leaderboard(period, metric, 100_000);
  return all.find((entry) => entry.userId === userId)?.rank ?? null;
}

export async function totalUsers(): Promise<number> {
  return (await snapshot()).profiles.length;
}

/**
 * How many accounts the board ranks — everyone signed up, less the private and
 * the opted-out. Used to say when the page is showing only the top of a longer
 * board.
 */
export async function rankedUsers(): Promise<number> {
  return (await snapshot()).profiles.filter(listedFor).length;
}

export interface GlobalTotals {
  cost: number;
  tokens: number;
  requests: number;
  users: number;
}

export async function globalTotals(period: Period): Promise<GlobalTotals> {
  const { usage } = await snapshot();
  const start = periodStart(period);

  const totals: GlobalTotals = { cost: 0, tokens: 0, requests: 0, users: 0 };
  const users = new Set<string>();

  for (const row of usage) {
    if (!inWindow(row, start)) continue;
    totals.cost += row.costUsd;
    totals.tokens += tokensOf(row);
    totals.requests += row.requests;
    users.add(row.userId);
  }

  totals.users = users.size;
  return totals;
}

/* --------------------------------------------------------------- profile */

export interface DayPoint {
  day: string;
  cost: number;
  tokens: number;
  requests: number;
  /**
   * The same day's tokens split by kind.
   *
   * The CLI has always uploaded this — every stored row carries the five
   * counts separately — but `byDay` used to add them together and throw the
   * breakdown away, which left every chart able to plot only money. On an
   * agent workload cache is most of the volume, so a tokens line without the
   * split hides the one thing worth seeing.
   *
   * Cache writes are combined here: the 5m/1h distinction changes the price,
   * not the shape of the day, and it is already shown where it matters in the
   * cost anatomy.
   */
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}

export interface ModelPoint {
  model: string;
  cost: number;
  tokens: number;
  requests: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface UserStats {
  totals: { cost: number; tokens: number; requests: number; days: number };
  tokens: {
    input: number;
    output: number;
    cacheWrite: number;
    cacheRead: number;
  };
  byDay: DayPoint[];
  byModel: ModelPoint[];
  byTool: { tool: string; cost: number; tokens: number; requests: number }[];
  firstDay: string | null;
  lastDay: string | null;
  streak: number;
  longestStreak: number;
  best: DayPoint | null;
}

export async function userStats(
  userId: string,
  period: Period = "all",
): Promise<UserStats> {
  const start = periodStart(period);
  // One user's rows, queried directly rather than filtered out of the
  // board-wide snapshot — a profile page should not pay for everyone's data.
  const rows = (await listUsage(userId)).filter((row) => inWindow(row, start));

  const days = new Map<string, DayPoint>();
  const models = new Map<string, ModelPoint>();
  const tools = new Map<
    string,
    { tool: string; cost: number; tokens: number; requests: number }
  >();

  for (const row of rows) {
    const day = days.get(row.day) ?? {
      day: row.day,
      cost: 0,
      tokens: 0,
      requests: 0,
      input: 0,
      output: 0,
      cacheWrite: 0,
      cacheRead: 0,
    };
    day.cost += row.costUsd;
    day.tokens += tokensOf(row);
    day.requests += row.requests;
    day.input += row.input;
    day.output += row.output;
    day.cacheWrite += row.cacheWrite5m + row.cacheWrite1h;
    day.cacheRead += row.cacheRead;
    days.set(row.day, day);

    const model =
      models.get(row.model) ??
      ({
        model: row.model,
        cost: 0,
        tokens: 0,
        requests: 0,
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
      } satisfies ModelPoint);
    model.cost += row.costUsd;
    model.tokens += tokensOf(row);
    model.requests += row.requests;
    model.input += row.input;
    model.output += row.output;
    model.cacheRead += row.cacheRead;
    model.cacheWrite += row.cacheWrite5m + row.cacheWrite1h;
    models.set(row.model, model);

    const tool = tools.get(row.tool) ?? {
      tool: row.tool,
      cost: 0,
      tokens: 0,
      requests: 0,
    };
    tool.cost += row.costUsd;
    tool.tokens += tokensOf(row);
    tool.requests += row.requests;
    tools.set(row.tool, tool);
  }

  const byDay = [...days.values()].sort((a, b) => a.day.localeCompare(b.day));
  const byModel = [...models.values()].sort((a, b) => b.cost - a.cost);
  const byTool = [...tools.values()].sort((a, b) => b.cost - a.cost);

  const totals = byDay.reduce(
    (acc, point) => ({
      cost: acc.cost + point.cost,
      tokens: acc.tokens + point.tokens,
      requests: acc.requests + point.requests,
      days: acc.days + 1,
    }),
    { cost: 0, tokens: 0, requests: 0, days: 0 },
  );

  const tokens = byModel.reduce(
    (acc, point) => ({
      input: acc.input + point.input,
      output: acc.output + point.output,
      cacheWrite: acc.cacheWrite + point.cacheWrite,
      cacheRead: acc.cacheRead + point.cacheRead,
    }),
    { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 },
  );

  const streaks = computeStreaks(byDay.map((point) => point.day));
  const best = byDay.reduce<DayPoint | null>(
    (top, point) => (top === null || point.cost > top.cost ? point : top),
    null,
  );

  return {
    totals,
    tokens,
    byDay,
    byModel,
    byTool,
    firstDay: byDay[0]?.day ?? null,
    lastDay: byDay[byDay.length - 1]?.day ?? null,
    streak: streaks.current,
    longestStreak: streaks.longest,
    best,
  };
}

/**
 * A streak is consecutive days with any usage. The current streak only counts
 * if it reaches today or yesterday — the day is not over everywhere at once, so
 * ending "yesterday" must not break it.
 */
function computeStreaks(days: string[]): { current: number; longest: number } {
  if (days.length === 0) return { current: 0, longest: 0 };

  let longest = 1;
  let run = 1;

  for (let index = 1; index < days.length; index++) {
    if (days[index] === shiftDay(days[index - 1]!, 1)) {
      run++;
    } else {
      run = 1;
    }
    longest = Math.max(longest, run);
  }

  const last = days[days.length - 1]!;
  const now = today();
  const live = last === now || last === shiftDay(now, -1);

  return { current: live ? run : 0, longest };
}

/* --------------------------------------------------------------- devices */

export interface SyncInfo {
  lastSyncAt: string | null;
  devices: number;
}

export async function syncInfo(userId: string): Promise<SyncInfo> {
  const devices = await listDevices(userId);
  const lastSyncAt = devices.reduce<string | null>(
    (latest, device) =>
      device.lastSyncAt && (!latest || device.lastSyncAt > latest)
        ? device.lastSyncAt
        : latest,
    null,
  );

  return { lastSyncAt, devices: devices.length };
}
