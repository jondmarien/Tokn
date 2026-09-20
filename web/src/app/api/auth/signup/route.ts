import { NextResponse } from "next/server";
import {
  HANDLE_RE,
  createSession,
  createUser,
  findUserByHandle,
  setSessionCookie,
} from "@/lib/auth";

/** POST /api/auth/signup — create an account and sign it in. */

export const dynamic = "force-dynamic";

const MIN_PASSWORD = 8;

export async function POST(request: Request) {
  let body: { handle?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "expected a JSON body" }, { status: 400 });
  }

  const handle = String(body.handle ?? "").trim();
  const password = String(body.password ?? "");

  if (!HANDLE_RE.test(handle)) {
    return NextResponse.json(
      { error: "handles are 2-24 characters: letters, digits, _ . -" },
      { status: 400 },
    );
  }

  if (password.length < MIN_PASSWORD) {
    return NextResponse.json(
      { error: `password must be at least ${MIN_PASSWORD} characters` },
      { status: 400 },
    );
  }

  if (await findUserByHandle(handle)) {
    return NextResponse.json({ error: "that handle is taken" }, { status: 409 });
  }

  const user = await createUser(handle, password);
  const session = await createSession(user.id);
  await setSessionCookie(session.id, session.expiresAt);

  return NextResponse.json({ handle: user.handle });
}
