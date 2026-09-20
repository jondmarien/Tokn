import { NextResponse } from "next/server";
import { passkeyRegisterVerify } from "@/lib/backend";
import { currentUser } from "@/lib/auth";
import { takeChallenge } from "@/lib/passkey-challenge";

/** POST /api/passkeys/register/verify — finish adding a passkey. */

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "sign in first" }, { status: 401 });

  const challenge = await takeChallenge();
  if (!challenge) {
    return NextResponse.json({ error: "that attempt expired — try again" }, { status: 400 });
  }

  let body: { response?: unknown; label?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "expected a JSON body" }, { status: 400 });
  }

  const result = await passkeyRegisterVerify(
    user.id,
    body.response as never,
    challenge,
    typeof body.label === "string" ? body.label : undefined,
  );

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result);
}
