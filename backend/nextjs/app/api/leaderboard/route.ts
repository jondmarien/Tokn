import { NextResponse } from "next/server";
import { globalStats, leaderboard, type Metric, type Window } from "@/lib/backend";

/**
 * GET /api/leaderboard?window=all|30d|7d&metric=cost|tokens
 *
 * Reads the denormalised `user_totals` rollup, not raw usage — one indexed
 * sort regardless of how much history anyone has.
 */

export const revalidate = 30;

const WINDOWS = new Set(["all", "30d", "7d"]);
const METRICS = new Set(["cost", "tokens"]);

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;

  const window = params.get("window") ?? "all";
  const metric = params.get("metric") ?? "cost";
  if (!WINDOWS.has(window) || !METRICS.has(metric)) {
    return NextResponse.json({ error: "unknown window or metric" }, { status: 400 });
  }

  const limit = Number(params.get("limit") ?? 100);

  return NextResponse.json({
    entries: await leaderboard({
      window: window as Window,
      metric: metric as Metric,
      limit: Number.isFinite(limit) ? limit : 100,
    }),
    stats: await globalStats(),
  });
}
