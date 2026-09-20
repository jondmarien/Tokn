import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import {
  acceptFriend,
  findUserIdByHandle,
  friendLists,
  removeFriend,
  requestFriend,
} from "@/lib/backend";

/**
 * GET  /api/friends            the three lists
 * POST /api/friends            { action, handle }
 *
 * One endpoint for add / accept / remove because they are the same row and the
 * same authorisation check. `remove` covers declining, cancelling and
 * unfriending: all three delete the pair.
 */

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "sign in first" }, { status: 401 });
  return NextResponse.json(await friendLists(user.id));
}

const ACTIONS = new Set(["add", "accept", "remove"]);

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "sign in first" }, { status: 401 });

  let body: { action?: string; handle?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "expected a JSON body" }, { status: 400 });
  }

  const action = String(body.action ?? "");
  const handle = String(body.handle ?? "").trim();
  if (!ACTIONS.has(action)) return NextResponse.json({ error: "unknown action" }, { status: 400 });
  if (!handle) return NextResponse.json({ error: "which handle?" }, { status: 400 });

  const targetId = await findUserIdByHandle(handle);
  // Same message whether the handle is missing or malformed, so this cannot be
  // used to enumerate who has an account.
  if (!targetId) return NextResponse.json({ error: `no account called @${handle}` }, { status: 404 });

  if (action === "add") {
    const result = await requestFriend(user.id, targetId);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ status: result.status });
  }

  if (action === "accept") {
    const ok = await acceptFriend(user.id, targetId);
    if (!ok) return NextResponse.json({ error: "no request from them to accept" }, { status: 400 });
    return NextResponse.json({ status: "accepted" });
  }

  await removeFriend(user.id, targetId);
  return NextResponse.json({ status: "removed" });
}
