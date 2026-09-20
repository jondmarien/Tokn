import { NextResponse } from "next/server";
import { passkeyRegisterOptions } from "@/lib/backend";
import { currentUser } from "@/lib/auth";
import { setChallenge } from "@/lib/passkey-challenge";

/** POST /api/passkeys/register/options — start adding a passkey. */

export const dynamic = "force-dynamic";

export async function POST() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "sign in first" }, { status: 401 });

  const result = await passkeyRegisterOptions(user.id);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  await setChallenge(result.challenge);
  return NextResponse.json(result.options);
}
