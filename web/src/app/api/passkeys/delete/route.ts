import { NextResponse } from "next/server";
import { deletePasskey } from "@/lib/backend";
import { currentUser } from "@/lib/auth";

/** POST /api/passkeys/delete — remove one of your own passkeys. */

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "sign in first" }, { status: 401 });

  let body: { id?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "expected a JSON body" }, { status: 400 });
  }

  // Scoped to the owner inside the repository, so an id from another account
  // cannot delete anything.
  const removed =
    typeof body.id === "string" ? await deletePasskey(user.id, body.id) : false;

  if (!removed) return NextResponse.json({ error: "no such passkey" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
