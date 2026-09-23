import "server-only";
import { revalidateTag } from "next/cache";

/**
 * Cache tags for the leaderboard, and the calls that clear them.
 *
 * The board's numbers refresh on the hour (see `stats.ts`), but who is on it
 * cannot wait that long. Someone who makes their account private, opts out of
 * the board, or deletes their account has to disappear from it the moment they
 * do, and a renamed account should not show its old handle for an hour. So
 * every write to a profile clears the cached profile list here, and the board
 * picks up the change on its next render.
 */

export const PROFILES_TAG = "board:profiles";
export const USAGE_TAG = "board:usage";

/** An account was created, renamed, or changed who can see it. */
export function profilesChanged(): void {
  revalidateTag(PROFILES_TAG);
}

/**
 * An account and all of its rows were deleted.
 *
 * The profile list alone would take them off the board, but the site-wide
 * totals are summed from the usage snapshot, which otherwise keeps a deleted
 * account's spend until its daily refresh. Deletion is rare enough that paying
 * for a fresh scan is the right trade.
 */
export function accountRemoved(): void {
  revalidateTag(PROFILES_TAG);
  revalidateTag(USAGE_TAG);
}
