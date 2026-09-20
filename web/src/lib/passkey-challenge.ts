import "server-only";
import { cookies } from "next/headers";

/**
 * The WebAuthn challenge, parked in a short-lived httpOnly cookie between the
 * two halves of a ceremony.
 *
 * A cookie rather than a row: the challenge is single-use and lives for
 * seconds, it belongs to one browser by definition, and this way an
 * unauthenticated sign-in ceremony needs no server state and no way to guess
 * at someone else's pending attempt.
 */

const COOKIE = "tokn_webauthn";
const TTL_SECONDS = 300;

export async function setChallenge(challenge: string): Promise<void> {
  const store = await cookies();
  store.set(COOKIE, challenge, {
    httpOnly: true,
    sameSite: "strict",
    // Set over plain HTTP in local dev, where the cookie would never be sent.
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TTL_SECONDS,
  });
}

/** Read and immediately retire it: a challenge is good for exactly one attempt. */
export async function takeChallenge(): Promise<string | null> {
  const store = await cookies();
  const value = store.get(COOKIE)?.value ?? null;
  store.delete(COOKIE);
  return value;
}
