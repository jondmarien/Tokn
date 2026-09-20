import { NextResponse } from "next/server";
import { clearSessionCookie, currentUser } from "@/lib/auth";
import { deleteAccount } from "@/lib/backend";

/**
 * POST /api/account/delete — erase the signed-in account.
 *
 * The privacy policy promises deletion is immediate and complete, so this
 * removes every row rather than flagging the profile as hidden.
 *
 * Confirmation is the handle, typed by the user. A single click is too easy to
 * make by accident for something with no undo.
 */

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "sign in first" }, { status: 401 });

  let body: { confirm?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "expected a JSON body" }, { status: 400 });
  }

  if ((body.confirm ?? "").trim().toLowerCase() !== user.handle.toLowerCase()) {
    return NextResponse.json(
      { error: `type ${user.handle} to confirm` },
      { status: 400 },
    );
  }

  const { removed } = await deleteAccount(user.id);

  // The session rows are gone; drop the cookie so the browser agrees.
  await clearSessionCookie();

  return NextResponse.json({ deleted: true, removed });
}
