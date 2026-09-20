import { NextResponse } from "next/server";
import { authenticateDevice, findUserByHandle } from "@/lib/auth";
import { anatomyFor, areFriends, burnRate, reuseBenchmark, whatIf } from "@/lib/backend";
import { rankOf, userStats } from "@/lib/stats";
import { parseLinks } from "@/lib/links";
import { parsePlans } from "@/lib/plans";

/**
 * GET /api/cli/profile?handle=… — one profile, for the terminal dashboard.
 *
 * The privacy rule is copied from the web page rather than reimplemented, and
 * it matters more here than it looks: a private profile must 404 exactly like
 * a missing one. Returning "this profile is private" would confirm the handle
 * exists, which is the thing making it private was meant to prevent. So both
 * cases take the same branch with the same message.
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await authenticateDevice(request.headers.get("authorization"));
  if (!auth) {
    return NextResponse.json({ error: "this machine is no longer linked" }, { status: 401 });
  }

  const handle = new URL(request.url).searchParams.get("handle")?.trim().replace(/^@/, "");
  const target = handle ? await findUserByHandle(handle) : auth.user;
  const missing = NextResponse.json({ error: "no such profile" }, { status: 404 });
  if (!target) return missing;

  const own = target.id === auth.user.id;
  const friend = !own && (await areFriends(auth.user.id, target.id));
  if (!target.isPublic && !own && !friend) return missing;

  const [stats, anatomy, priced] = await Promise.all([
    userStats(target.id, "all"),
    anatomyFor(target.id),
    whatIf(target.id),
  ]);

  const benchmark = await reuseBenchmark(target.id, anatomy);
  const rank = target.listed ? await rankOf(target.id, "all", "cost") : null;

  return NextResponse.json({
    user: {
      handle: target.handle,
      name: target.name ?? null,
      bio: target.bio ?? null,
      createdAt: target.created_at,
      billing: target.billing,
      links: parseLinks(target.links),
      plans: parsePlans(target.plans),
      isPublic: target.isPublic,
      listed: target.listed,
      own,
      friend,
    },
    rank,
    stats,
    anatomy,
    benchmark,
    // The page derives this from `stats.byDay` at render time rather than
    // storing it, so the terminal has to derive it the same way or the
    // projection will disagree with the website for the same account.
    burn: burnRate(stats.byDay.map((d) => ({ day: d.day, costUsd: d.cost }))),
    whatIf: priced,
  });
}
