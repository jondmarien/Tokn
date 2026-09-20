import { NextResponse } from "next/server";
import { createSession, setSessionCookie, verifyLogin } from "@/lib/auth";

/** POST /api/auth/login — start a browser session. */

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: { handle?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "expected a JSON body" }, { status: 400 });
  }

  const handle = String(body.handle ?? "").trim();
  const password = String(body.password ?? "");

  // The password check lives in the backend so the hash never leaves it, and
  // a missing handle still costs the same work — this cannot be used to
  // enumerate handles.
  const user = handle ? await verifyLogin(handle, password) : undefined;

  if (!user) {
    return NextResponse.json({ error: "wrong handle or password" }, { status: 401 });
  }

  const session = await createSession(user.id);
  await setSessionCookie(session.id, session.expiresAt);

  return NextResponse.json({ handle: user.handle });
}
