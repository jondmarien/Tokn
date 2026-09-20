import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { friendsLeaderboard, type FriendMetric, type FriendWindow } from "@/lib/backend";

/** GET /api/friends/board?window=all|30d|7d&metric=cost|tokens|requests */

export const dynamic = "force-dynamic";

const WINDOWS = new Set(["all", "30d", "7d"]);
const METRICS = new Set(["cost", "tokens", "requests"]);

export async function GET(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "sign in first" }, { status: 401 });

  const params = new URL(request.url).searchParams;
  const window = params.get("window") ?? "all";
  const metric = params.get("metric") ?? "cost";
  if (!WINDOWS.has(window) || !METRICS.has(metric)) {
    return NextResponse.json({ error: "unknown window or metric" }, { status: 400 });
  }

  return NextResponse.json({
    entries: await friendsLeaderboard(user.id, {
      window: window as FriendWindow,
      metric: metric as FriendMetric,
    }),
  });
}
