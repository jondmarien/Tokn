import { NextResponse } from "next/server";
import { authenticateDevice } from "@/lib/auth";
import { leaderboard } from "@/lib/stats";
import { siteStats } from "@/lib/site-stats";

/**
 * GET /api/cli/site — the global stats page, for the terminal dashboard.
 *
 * Same window and same top-ten cut as `/stats`, so the two can be read side by
 * side without wondering which one is stale.
 */

export const dynamic = "force-dynamic";

const WINDOW_DAYS = 30;
const TOP_ROWS = 10;

export async function GET(request: Request) {
  const auth = await authenticateDevice(request.headers.get("authorization"));
  if (!auth) {
    return NextResponse.json(
      { error: "this machine is no longer linked" },
      { status: 401 },
    );
  }

  const [stats, top] = await Promise.all([
    siteStats(WINDOW_DAYS),
    leaderboard("month", "cost", TOP_ROWS, { activeOnly: true }),
  ]);

  return NextResponse.json({ stats, top });
}
