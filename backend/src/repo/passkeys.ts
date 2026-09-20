import { db, DB_ID, Query } from "../client.ts";
import { newId } from "../ids.ts";

/**
 * WebAuthn credentials.
 *
 * Only public keys live here. There is no shared secret: the private half
 * never leaves the authenticator, so this table leaking does not let anyone
 * sign in as anybody. That is the whole point of a passkey over a password.
 */

export interface Passkey {
  $id: string;
  userId: string;
  credentialId: string;
  publicKey: string;
  counter: number;
  transports?: string | null;
  label?: string | null;
  createdAt: string;
  lastUsedAt?: string | null;
}

/** How many a single account may register, so one user cannot fill the table. */
export const MAX_PASSKEYS = 10;

export async function listPasskeys(userId: string): Promise<Passkey[]> {
  const result = await db().listDocuments(DB_ID, "passkeys", [
    Query.equal("userId", userId),
    Query.orderAsc("createdAt"),
    Query.limit(MAX_PASSKEYS),
  ]);
  return result.documents as unknown as Passkey[];
}

/**
 * Look a credential up by the id the authenticator presented.
 *
 * This is what makes a usernameless sign-in possible: the browser hands back a
 * credential id and we find the account from it, with nothing typed.
 */
export async function findPasskey(credentialId: string): Promise<Passkey | null> {
  const result = await db().listDocuments(DB_ID, "passkeys", [
    Query.equal("credentialId", credentialId),
    Query.limit(1),
  ]);
  return (result.documents[0] as unknown as Passkey) ?? null;
}

export async function createPasskey(input: {
  userId: string;
  credentialId: string;
  publicKey: string;
  counter: number;
  transports?: string[];
  label?: string;
}): Promise<Passkey> {
  return (await db().createDocument(DB_ID, "passkeys", newId("pk"), {
    userId: input.userId,
    credentialId: input.credentialId,
    publicKey: input.publicKey,
    counter: input.counter,
    transports: input.transports?.length ? JSON.stringify(input.transports) : null,
    label: input.label ?? null,
    createdAt: new Date().toISOString(),
  })) as unknown as Passkey;
}

/**
 * Record a successful assertion.
 *
 * The counter is the replay signal: an authenticator that reports a value it
 * has already used is a clone. Not every authenticator implements it — many
 * platform ones always report 0 — so this stores what was given rather than
 * insisting it advance.
 */
export async function touchPasskey(id: string, counter: number): Promise<void> {
  await db().updateDocument(DB_ID, "passkeys", id, {
    counter,
    lastUsedAt: new Date().toISOString(),
  });
}

export async function deletePasskey(userId: string, id: string): Promise<boolean> {
  const existing = (await db()
    .getDocument(DB_ID, "passkeys", id)
    .catch(() => null)) as unknown as Passkey | null;

  // Scoped to the owner: an id from someone else's account must not delete.
  if (!existing || existing.userId !== userId) return false;

  await db().deleteDocument(DB_ID, "passkeys", id);
  return true;
}

export async function deleteAllPasskeys(userId: string): Promise<number> {
  const keys = await listPasskeys(userId);
  for (const key of keys) {
    await db().deleteDocument(DB_ID, "passkeys", key.$id);
  }
  return keys.length;
}
