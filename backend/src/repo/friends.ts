import crypto from "node:crypto";
import { db, DB_ID, Query, isConflict, isNotFound } from "../client.ts";
import { findProfileById, findProfileByHandle, toPublicUser, type Profile, type PublicUser } from "./profiles.ts";
import type { Totals } from "./leaderboard.ts";

/**
 * Friendships.
 *
 * One row per pair rather than per direction. The row id is a hash of the two
 * user ids **sorted**, so a request from A to B and one from B to A address the
 * same row. That single decision removes a whole class of bug: no duplicate
 * requests, no pair that is friends in one direction only, and no need to keep
 * two rows in step when someone accepts or leaves.
 *
 * It also gives mutual intent for free. If B has already asked A, A asking B
 * lands on B's pending row and accepts it, which is what both of them meant.
 */

export type FriendStatus = "pending" | "accepted";

export interface Friendship {
  $id: string;
  userA: string;
  userB: string;
  requestedBy: string;
  status: FriendStatus;
  createdAt: string;
  respondedAt?: string | null;
}

/** Sorted, so the pair is the identity and direction is stored separately. */
function pairId(a: string, b: string): string {
  const [x, y] = a < b ? [a, b] : [b, a];
  return `f${crypto.createHash("sha256").update(`${x}|${y}`).digest("hex").slice(0, 35)}`;
}

function sorted(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

/** The other party, from one side's point of view. */
export function otherId(row: Friendship, userId: string): string {
  return row.userA === userId ? row.userB : row.userA;
}

/**
 * Someone could otherwise paper the whole board with requests. This is not a
 * rate limit, just a ceiling on how much noise one account can create.
 */
const MAX_PENDING_OUT = 50;

export type RequestResult =
  | { ok: true; status: FriendStatus; friendship: Friendship }
  | { ok: false; error: string };

export async function requestFriend(fromId: string, toId: string): Promise<RequestResult> {
  if (fromId === toId) return { ok: false, error: "you cannot add yourself" };

  const target = await findProfileById(toId);
  if (!target) return { ok: false, error: "no such account" };

  const id = pairId(fromId, toId);
  const [userA, userB] = sorted(fromId, toId);
  const now = new Date().toISOString();

  const existing = await readPair(fromId, toId);

  if (existing) {
    if (existing.status === "accepted") {
      return { ok: false, error: `you and @${target.handle} are already friends` };
    }
    if (existing.requestedBy === fromId) {
      return { ok: false, error: "that request is already waiting for them" };
    }

    // They asked first. Asking back is an acceptance.
    const accepted = (await db().updateDocument(DB_ID, "friendships", id, {
      status: "accepted",
      respondedAt: now,
    })) as unknown as Friendship;
    return { ok: true, status: "accepted", friendship: accepted };
  }

  const outgoing = await countOutgoing(fromId);
  if (outgoing >= MAX_PENDING_OUT) {
    return { ok: false, error: "too many requests waiting for a reply" };
  }

  try {
    const created = (await db().createDocument(DB_ID, "friendships", id, {
      userA,
      userB,
      requestedBy: fromId,
      status: "pending",
      createdAt: now,
      respondedAt: null,
    })) as unknown as Friendship;
    return { ok: true, status: "pending", friendship: created };
  } catch (error) {
    // Both sides pressed at once; whoever lost reads back the winner's row.
    if (isConflict(error)) {
      const raced = await readPair(fromId, toId);
      if (raced) return { ok: true, status: raced.status, friendship: raced };
    }
    throw error;
  }
}

export async function readPair(a: string, b: string): Promise<Friendship | null> {
  try {
    return (await db().getDocument(DB_ID, "friendships", pairId(a, b))) as unknown as Friendship;
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

/** Accept a request. Only the person who did not send it may accept. */
export async function acceptFriend(userId: string, otherUserId: string): Promise<boolean> {
  const row = await readPair(userId, otherUserId);
  if (!row || row.status !== "pending" || row.requestedBy === userId) return false;

  await db().updateDocument(DB_ID, "friendships", row.$id, {
    status: "accepted",
    respondedAt: new Date().toISOString(),
  });
  return true;
}

/**
 * Remove the pair entirely.
 *
 * Declining, cancelling and unfriending are the same operation on the same
 * row, so they are the same function. Deleting rather than marking it rejected
 * means a later request starts clean instead of hitting a tombstone.
 */
export async function removeFriend(userId: string, otherUserId: string): Promise<boolean> {
  const row = await readPair(userId, otherUserId);
  if (!row) return false;
  // Only a party to the friendship can end it.
  if (row.userA !== userId && row.userB !== userId) return false;

  await db().deleteDocument(DB_ID, "friendships", row.$id);
  return true;
}

export async function areFriends(a: string, b: string): Promise<boolean> {
  if (a === b) return false;
  const row = await readPair(a, b);
  return row?.status === "accepted";
}

/* --------------------------------------------------------------- listing */

async function listInvolving(userId: string, status?: FriendStatus): Promise<Friendship[]> {
  const out: Friendship[] = [];
  let cursor: string | undefined;

  for (;;) {
    const queries = [
      Query.or([Query.equal("userA", userId), Query.equal("userB", userId)]),
      Query.limit(100),
      Query.orderAsc("$id"),
    ];
    if (status) queries.push(Query.equal("status", status));
    if (cursor) queries.push(Query.cursorAfter(cursor));

    const page = await db().listDocuments(DB_ID, "friendships", queries);
    const docs = page.documents as unknown as Friendship[];
    out.push(...docs);

    if (docs.length < 100) break;
    cursor = docs[docs.length - 1]?.$id;
    if (!cursor) break;
  }

  return out;
}

async function countOutgoing(userId: string): Promise<number> {
  const pending = await listInvolving(userId, "pending");
  return pending.filter((row) => row.requestedBy === userId).length;
}

export interface FriendLists {
  friends: PublicUser[];
  /** They asked; this user has yet to answer. */
  incoming: PublicUser[];
  /** This user asked; waiting on them. */
  outgoing: PublicUser[];
}

/** Everything the friends page needs, resolved to profiles. */
export async function friendLists(userId: string): Promise<FriendLists> {
  const rows = await listInvolving(userId);

  const buckets = { friends: [] as string[], incoming: [] as string[], outgoing: [] as string[] };
  for (const row of rows) {
    const other = otherId(row, userId);
    if (row.status === "accepted") buckets.friends.push(other);
    else if (row.requestedBy === userId) buckets.outgoing.push(other);
    else buckets.incoming.push(other);
  }

  const ids = [...new Set([...buckets.friends, ...buckets.incoming, ...buckets.outgoing])];
  const profiles = new Map<string, Profile>();

  // One query per hundred rather than one per person.
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const page = await db().listDocuments(DB_ID, "profiles", [
      Query.equal("$id", chunk),
      Query.limit(100),
    ]);
    for (const doc of page.documents as unknown as Profile[]) profiles.set(doc.$id, doc);
  }

  const resolve = (list: string[]) =>
    list
      .map((id) => profiles.get(id))
      .filter((p): p is Profile => p !== undefined)
      .map(toPublicUser)
      .sort((a, b) => a.handle.localeCompare(b.handle));

  return {
    friends: resolve(buckets.friends),
    incoming: resolve(buckets.incoming),
    outgoing: resolve(buckets.outgoing),
  };
}

export async function friendIds(userId: string): Promise<string[]> {
  const rows = await listInvolving(userId, "accepted");
  return rows.map((row) => otherId(row, userId));
}

/* ----------------------------------------------------------- leaderboard */

export interface FriendRank extends Totals {
  rank: number;
  value: number;
  isSelf: boolean;
}

export type FriendMetric = "cost" | "tokens" | "requests";
export type FriendWindow = "all" | "30d" | "7d";

const FIELD: Record<FriendWindow, Record<FriendMetric, string>> = {
  all: { cost: "costUsd", tokens: "tokens", requests: "requests" },
  "30d": { cost: "costUsd30d", tokens: "tokens", requests: "requests" },
  "7d": { cost: "costUsd7d", tokens: "tokens", requests: "requests" },
};

/**
 * A board of this user and their friends.
 *
 * Reads `user_totals`, so it costs one query however much history anyone has.
 * The `listed` flag is deliberately ignored: hiding from the public board is
 * not the same as hiding from people you accepted as friends, and a private
 * profile that vanished from its own friends board would be confusing.
 */
export async function friendsLeaderboard(
  userId: string,
  options: { window?: FriendWindow; metric?: FriendMetric } = {},
): Promise<FriendRank[]> {
  const field = FIELD[options.window ?? "all"][options.metric ?? "cost"];
  const ids = [...(await friendIds(userId)), userId];

  // Profiles first, totals second. Built the other way round, anyone who has
  // not synced yet disappears — including you, on the day you sign up, which
  // makes an empty board look broken. A friends board is a roster: everybody
  // appears, and the ones with nothing to show say so.
  const profiles = new Map<string, Profile>();
  const totals = new Map<string, Totals>();

  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const [people, stats] = await Promise.all([
      db().listDocuments(DB_ID, "profiles", [Query.equal("$id", chunk), Query.limit(100)]),
      db().listDocuments(DB_ID, "user_totals", [Query.equal("userId", chunk), Query.limit(100)]),
    ]);
    for (const doc of people.documents as unknown as Profile[]) profiles.set(doc.$id, doc);
    for (const doc of stats.documents as unknown as Totals[]) totals.set(doc.userId, doc);
  }

  const rows: FriendRank[] = [];
  for (const id of ids) {
    const profile = profiles.get(id);
    if (!profile) continue; // Deleted account still referenced by a stale row.

    const stat = totals.get(id);
    rows.push({
      ...(stat ?? blankTotals(id, profile)),
      rank: 0,
      value: stat ? ((stat as unknown as Record<string, number>)[field] ?? 0) : 0,
      isSelf: id === userId,
    });
  }

  return rows
    .sort((a, b) => b.value - a.value || a.handle.localeCompare(b.handle))
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

/** A friend who has not synced yet. Zeroes, not absence. */
function blankTotals(userId: string, profile: Profile): Totals {
  return {
    $id: userId,
    userId,
    handle: profile.handle,
    handleLower: profile.handleLower,
    isPublic: profile.isPublic !== false,
    listed: true,
    costUsd: 0,
    costUsd7d: 0,
    costUsd30d: 0,
    tokens: 0,
    requests: 0,
    activeDays: 0,
    firstDay: null,
    lastDay: null,
    topModel: null,
    topTool: null,
    toolCount: 0,
    lastSyncAt: null,
    updatedAt: profile.createdAt,
  };
}

/** Resolve a handle to an id, for "add by handle". */
export async function findUserIdByHandle(handle: string): Promise<string | null> {
  const profile = await findProfileByHandle(handle);
  return profile?.$id ?? null;
}
