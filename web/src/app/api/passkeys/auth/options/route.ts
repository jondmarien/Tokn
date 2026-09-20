import { NextResponse } from "next/server";
import { passkeyAuthOptions } from "@/lib/backend";
import { setChallenge } from "@/lib/passkey-challenge";

/**
 * POST /api/passkeys/auth/options — start a passkey sign-in.
 *
 * Unauthenticated by nature, and deliberately says nothing about who exists:
 * the options carry no credential list, so the authenticator decides what to
 * offer and the response is identical for every visitor.
 */

export const dynamic = "force-dynamic";

export async function POST() {
  const result = await passkeyAuthOptions();
  await setChallenge(result.challenge);
  return NextResponse.json(result.options);
}
