import { NextResponse } from "next/server";
import { authenticateDevice } from "@/lib/auth";
import {
  friendLists,
  friendsLeaderboard,
  type FriendMetric,
  type FriendWindow,
} from "@/lib/backend";

/**
 * GET /api/cli/friends — the friends board and roster, for the terminal.
 *
 * GET only, on purpose. The browser version of this panel can add, accept and
 * remove people; the terminal one shows them. Adding a friend from a linked
 * machine would mean a device token could reshape who sees a private profile,
 * which is a bigger authority than a token whose job is uploading token counts
 * should carry.
 */

export const dynamic = "force-dynamic";

const WINDOWS: FriendWindow[] = ["all", "30d", "7d"];
const METRICS: FriendMetric[] = ["cost", "tokens", "requests"];

export async function GET(request: Request) {
  const auth = await authenticateDevice(request.headers.get("authorization"));
  if (!auth) {
    return NextResponse.json({ error: "this machine is no longer linked" }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  const window = pick(params.get("window"), WINDOWS, "all");
  const metric = pick(params.get("metric"), METRICS, "cost");

  const [lists, entries] = await Promise.all([
    friendLists(auth.user.id),
    friendsLeaderboard(auth.user.id, { window, metric }),
  ]);

  return NextResponse.json({
    window,
    metric,
    // `friendsLeaderboard` is a roster, not a ranking: it includes you, and it
    // includes friends who have never synced (zeroed, `lastSyncAt` null). The
    // terminal shows them the same way the web panel does, because a friend
    // vanishing from the board until they sync reads as a bug.
    entries,
    friends: lists.friends,
    incoming: lists.incoming,
    outgoing: lists.outgoing,
  });
}

function pick<T extends string>(raw: string | null, allowed: T[], fallback: T): T {
  return allowed.includes(raw as T) ? (raw as T) : fallback;
}
