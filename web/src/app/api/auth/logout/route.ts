import { NextResponse } from "next/server";
import { clearSessionCookie, deleteSession } from "@/lib/auth";

/** POST /api/auth/logout — end this browser session. */

export const dynamic = "force-dynamic";

export async function POST() {
  const sessionId = await clearSessionCookie();
  if (sessionId) await deleteSession(sessionId);
  return NextResponse.json({ ok: true });
}
