import { NextResponse } from "next/server";
import { issueLinkCode } from "@/lib/backend";
import { currentUser } from "@/lib/session";

/**
 * POST /api/link/code — issue a fresh code for the signed-in user to paste
 * into `tokn link`.
 *
 * Issuing retires any code the user still has outstanding, so reloading the
 * link page cannot leave a trail of codes that all still work.
 */

export const dynamic = "force-dynamic";

export async function POST() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "sign in first" }, { status: 401 });

  return NextResponse.json(await issueLinkCode(user.$id));
}
