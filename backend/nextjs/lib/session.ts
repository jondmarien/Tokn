import { cookies } from "next/headers";
import { createSession, deleteSession, resolveSession, type Profile } from "./backend";

/**
 * The browser session cookie.
 *
 * Separate from CLI device tokens: a session is a cookie that expires in 30
 * days and can be signed out; a device token is long-lived and belongs to a
 * machine. Revoking one must not touch the other.
 */

const COOKIE = "tokn_session";

export async function currentUser(): Promise<Profile | null> {
  const store = await cookies();
  return resolveSession(store.get(COOKIE)?.value);
}

export async function signIn(userId: string): Promise<void> {
  const session = await createSession(userId);
  const store = await cookies();
  store.set(COOKIE, session.id, {
    httpOnly: true,
    sameSite: "lax",
    // Would never be sent over plain HTTP in local dev otherwise.
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: session.expiresAt,
  });
}

export async function signOut(): Promise<void> {
  const store = await cookies();
  const existing = store.get(COOKIE)?.value;
  if (existing) await deleteSession(existing);
  store.delete(COOKIE);
}
