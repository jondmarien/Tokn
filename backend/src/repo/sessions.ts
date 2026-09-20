import { db, DB_ID, Query, isNotFound } from "../client.ts";
import { newId } from "../ids.ts";
import { findProfileById, type Profile } from "./profiles.ts";

/**
 * Browser sessions for the dashboard.
 *
 * Separate from CLI device tokens on purpose: a session is a cookie that
 * expires in 30 days and can be signed out; a device token is long-lived and
 * belongs to a machine. Revoking one must not touch the other.
 */

const SESSION_DAYS = 30;

export interface Session {
  $id: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
}

export async function createSession(userId: string): Promise<{ id: string; expiresAt: Date }> {
  const sessionId = newId("ses");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_DAYS * 86_400_000);

  await db().createDocument(DB_ID, "sessions", sessionId, {
    userId,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  });

  return { id: sessionId, expiresAt };
}

/** Resolve a session id to its owner, or null if missing or expired. */
export async function resolveSession(sessionId: string | undefined): Promise<Profile | null> {
  if (!sessionId) return null;

  let session: Session;
  try {
    session = (await db().getDocument(DB_ID, "sessions", sessionId)) as unknown as Session;
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }

  if (new Date(session.expiresAt).getTime() < Date.now()) {
    await deleteSession(sessionId);
    return null;
  }

  return findProfileById(session.userId);
}

export async function deleteSession(sessionId: string): Promise<void> {
  await db().deleteDocument(DB_ID, "sessions", sessionId).catch(() => {});
}

/** Sign out everywhere — used when a password changes. */
export async function deleteUserSessions(userId: string): Promise<void> {
  const result = await db().listDocuments(DB_ID, "sessions", [
    Query.equal("userId", userId),
    Query.limit(100),
  ]);
  for (const doc of result.documents) {
    await db().deleteDocument(DB_ID, "sessions", doc.$id).catch(() => {});
  }
}

/**
 * Drop sessions that have already expired.
 *
 * Expired sessions are refused on read regardless, so this is only housekeeping
 * — worth running from a scheduled function, not on the request path.
 */
export async function pruneExpiredSessions(): Promise<number> {
  const now = new Date().toISOString();
  let removed = 0;

  for (;;) {
    const page = await db().listDocuments(DB_ID, "sessions", [
      Query.lessThan("expiresAt", now),
      Query.limit(100),
    ]);
    if (page.documents.length === 0) break;

    for (const doc of page.documents) {
      await db().deleteDocument(DB_ID, "sessions", doc.$id).catch(() => {});
      removed++;
    }
    if (page.documents.length < 100) break;
  }

  return removed;
}
