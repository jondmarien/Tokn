import { NextResponse } from "next/server";
import { passkeyAuthVerify } from "@/lib/backend";
import { createSession, setSessionCookie } from "@/lib/auth";
import { takeChallenge } from "@/lib/passkey-challenge";

/** POST /api/passkeys/auth/verify — finish a passkey sign-in. */

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const challenge = await takeChallenge();
  if (!challenge) {
    return NextResponse.json({ error: "that attempt expired — try again" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "expected a JSON body" }, { status: 400 });
  }

  const result = await passkeyAuthVerify(body as never, challenge);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const session = await createSession(result.profile.$id);
  await setSessionCookie(session.id, session.expiresAt);

  return NextResponse.json({ handle: result.profile.handle });
}
