import { NextResponse } from "next/server";
import { authenticateDevice } from "@/lib/auth";
import {
  MOVEMENT_LOOKBACK_DAYS,
  boardUpdatedAt,
  globalTotals,
  isMetric,
  isPeriod,
  leaderboard,
  previousRanks,
  rankOf,
  recentSeries,
  totalUsers,
  type Metric,
  type Period,
} from "@/lib/stats";

/**
 * GET /api/cli/board — the home leaderboard, for the terminal dashboard.
 *
 * Deliberately assembled from the same `lib/stats` functions the web page
 * calls, in the same order with the same arguments. Recomputing any of it here
 * would guarantee the two drift: someone would fix a rounding rule on the page
 * and the terminal would quietly keep the old number. The only thing this file
 * decides is the wire shape.
 *
 * Read-only. There is no POST here and no mutation reachable from it.
 */

export const dynamic = "force-dynamic";

const ROWS = 100;

export async function GET(request: Request) {
  const auth = await authenticateDevice(request.headers.get("authorization"));
  if (!auth) {
    return NextResponse.json({ error: "this machine is no longer linked" }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  const periodRaw = params.get("period") ?? undefined;
  const metricRaw = params.get("metric") ?? undefined;
  const period: Period = isPeriod(periodRaw) ? periodRaw : "all";
  const metric: Metric = isMetric(metricRaw) ? metricRaw : "cost";

  const [rows, totals, previous, users, series, updatedAt] = await Promise.all([
    leaderboard(period, metric, ROWS),
    globalTotals(period),
    previousRanks(period, metric),
    totalUsers(),
    // Fourteen days of daily spend per user, for the sparkline column. The web
    // table has room for a `last` column instead; a terminal row has the width
    // for a shape, and the shape is more use than a date.
    recentSeries(14),
    boardUpdatedAt(),
  ]);

  const me = auth.user.id;
  const inTop = rows.some((r) => r.userId === me);

  // Same trick the page uses: when you are off the end of the board, fetch far
  // enough down to find your own row and append it, so you always see yourself.
  let mine = null;
  let myRank: number | null = null;
  if (!inTop) {
    myRank = await rankOf(me, period, metric);
    if (myRank !== null) {
      const deep = await leaderboard(period, metric, myRank);
      mine = deep.find((r) => r.userId === me) ?? null;
    }
  }

  const decorate = (entry: (typeof rows)[number]) => ({
    ...entry,
    isSelf: entry.userId === me,
    previousRank: previous.get(entry.userId) ?? null,
    series: series.get(entry.userId) ?? [],
  });

  return NextResponse.json({
    period,
    metric,
    lookbackDays: MOVEMENT_LOOKBACK_DAYS,
    totals: { ...totals, registered: users },
    rows: rows.map(decorate),
    self: mine ? { ...decorate(mine), rank: myRank ?? mine.rank } : null,
    me: { id: me, handle: auth.user.handle },
    updatedAt,
  });
}
