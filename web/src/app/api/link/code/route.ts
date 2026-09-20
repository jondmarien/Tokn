import { NextResponse } from "next/server";
import { currentUser, issueLinkCode } from "@/lib/auth";

/** POST /api/link/code — issue a fresh code for the signed-in browser session. */

export const dynamic = "force-dynamic";

export async function POST() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "sign in first" }, { status: 401 });

  const { code, expiresAt } = await issueLinkCode(user.id);
  return NextResponse.json({ code, expiresAt });
}
