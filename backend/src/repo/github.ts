import crypto from "node:crypto";
import { db, DB_ID, Query, isConflict } from "../client.ts";
// Imported for its side effect: loading the repo-root .env before the values
// below are read. Import order should not decide whether GitHub sign-in works.
import "../env.ts";
import { newId } from "../ids.ts";
import { HANDLE_RE, type Profile } from "./profiles.ts";

/**
 * Sign in with GitHub.
 *
 * Implemented as a plain OAuth2 authorization-code flow rather than through
 * Appwrite's own OAuth, because identity here is the `profiles` collection —
 * the handle is the public name on the leaderboard and the CLI's device tokens
 * hang off it. Routing sign-in through Appwrite Auth would introduce a second
 * identity system to keep in step with the first.
 *
 * Accounts are matched on GitHub's numeric `id`, never on the login name: a
 * login can be renamed and then claimed by somebody else, so joining on it
 * would eventually hand one person another's account.
 */

const AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
const TOKEN_URL = "https://github.com/login/oauth/access_token";
const API_URL = "https://api.github.com";

export interface GithubConfig {
  clientId: string;
  clientSecret: string;
  /** Must match the callback registered on the OAuth app exactly. */
  callbackUrl: string;
}

export function githubConfig(): GithubConfig | null {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const base = (process.env.TOKN_PUBLIC_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  return {
    clientId,
    clientSecret,
    callbackUrl: process.env.GITHUB_CALLBACK_URL ?? `${base}/api/auth/github/callback`,
  };
}

/** Is GitHub sign-in configured on this deployment? */
export function githubEnabled(): boolean {
  return githubConfig() !== null;
}

/**
 * A signed state value, so the callback can prove the request started here.
 *
 * Carries an optional `link` user id, which is how "connect GitHub to my
 * existing account" is distinguished from "sign in". Signed with the client
 * secret rather than stored server-side: it is short-lived and self-describing,
 * so there is nothing to clean up.
 */
export function createState(payload: { link?: string; next?: string } = {}): string {
  const config = githubConfig();
  if (!config) throw new Error("GitHub sign-in is not configured");

  const body = JSON.stringify({
    nonce: crypto.randomBytes(12).toString("hex"),
    at: Date.now(),
    ...payload,
  });

  const data = Buffer.from(body).toString("base64url");
  const signature = crypto
    .createHmac("sha256", config.clientSecret)
    .update(data)
    .digest("base64url");

  return `${data}.${signature}`;
}

const STATE_TTL_MS = 10 * 60_000;

export function verifyState(state: string | undefined): { link?: string; next?: string } | null {
  const config = githubConfig();
  if (!config || !state) return null;

  const [data, signature] = state.split(".");
  if (!data || !signature) return null;

  const expected = crypto
    .createHmac("sha256", config.clientSecret)
    .update(data)
    .digest("base64url");

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(data, "base64url").toString("utf8")) as {
      at?: number;
      link?: string;
      next?: string;
    };
    // An old state means a stale tab, or a replay.
    if (typeof payload.at !== "number" || Date.now() - payload.at > STATE_TTL_MS) return null;
    return { link: payload.link, next: payload.next };
  } catch {
    return null;
  }
}

export function authorizeUrl(state: string): string {
  const config = githubConfig();
  if (!config) throw new Error("GitHub sign-in is not configured");

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.callbackUrl,
    // Only the public profile and the verified email. No repository access is
    // requested, and none is needed.
    scope: "read:user user:email",
    state,
    allow_signup: "true",
  });

  return `${AUTHORIZE_URL}?${params.toString()}`;
}

export interface GithubUser {
  id: string;
  login: string;
  name: string | null;
  avatarUrl: string | null;
  bio: string | null;
  blog: string | null;
}

export class GithubError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GithubError";
  }
}

/** Trade the callback code for an access token, then read the user. */
export async function exchangeCode(code: string): Promise<GithubUser> {
  const config = githubConfig();
  if (!config) throw new GithubError("GitHub sign-in is not configured");

  const tokenResponse = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: config.callbackUrl,
    }),
  });

  if (!tokenResponse.ok) {
    throw new GithubError(`GitHub rejected the token exchange (HTTP ${tokenResponse.status})`);
  }

  const token = (await tokenResponse.json()) as { access_token?: string; error_description?: string };
  if (!token.access_token) {
    throw new GithubError(token.error_description ?? "GitHub did not return an access token");
  }

  const headers = {
    authorization: `Bearer ${token.access_token}`,
    accept: "application/vnd.github+json",
    "user-agent": "tokn",
  };

  const userResponse = await fetch(`${API_URL}/user`, { headers });
  if (!userResponse.ok) {
    throw new GithubError(`could not read your GitHub profile (HTTP ${userResponse.status})`);
  }

  const user = (await userResponse.json()) as {
    id?: number;
    login?: string;
    name?: string | null;
    avatar_url?: string | null;
    bio?: string | null;
    blog?: string | null;
  };

  if (!user.id || !user.login) throw new GithubError("GitHub returned an unexpected profile");

  return {
    id: String(user.id),
    login: user.login,
    name: user.name ?? null,
    avatarUrl: user.avatar_url ?? null,
    bio: user.bio ?? null,
    blog: user.blog && user.blog.length > 0 ? user.blog : null,
  };
}

/* ------------------------------------------------------------- accounts */

export async function findProfileByGithubId(githubId: string): Promise<Profile | null> {
  const result = await db().listDocuments(DB_ID, "profiles", [
    Query.equal("githubId", githubId),
    Query.limit(1),
  ]);
  return (result.documents[0] as unknown as Profile) ?? null;
}

/**
 * Turn a GitHub login into a handle that is free and legal here.
 *
 * GitHub allows hyphens and names we do not, and the handle may already be
 * taken by a password account, so fall back to numbered suffixes.
 */
async function allocateHandle(login: string): Promise<string> {
  const base =
    login
      .toLowerCase()
      .replace(/[^a-z0-9_.-]/g, "")
      .replace(/^[^a-z0-9_]+/, "")
      .slice(0, 20) || "dev";

  for (const candidate of [base, ...Array.from({ length: 50 }, (_, i) => `${base}${i + 2}`)]) {
    if (!HANDLE_RE.test(candidate)) continue;
    const taken = await db().listDocuments(DB_ID, "profiles", [
      Query.equal("handleLower", candidate.toLowerCase()),
      Query.limit(1),
    ]);
    if (taken.documents.length === 0) return candidate;
  }

  return `${base}${crypto.randomBytes(3).toString("hex")}`.slice(0, 24);
}

export type SignInResult =
  | { ok: true; profile: Profile; created: boolean }
  | { ok: false; error: string };

/**
 * Sign in, link, or register — whichever the situation calls for.
 *
 * `linkUserId` is set when a signed-in user is connecting GitHub to the account
 * they already have, which must never silently switch them to a different one.
 */
export async function signInWithGithub(
  user: GithubUser,
  linkUserId?: string,
): Promise<SignInResult> {
  const existing = await findProfileByGithubId(user.id);

  if (linkUserId) {
    if (existing && existing.$id !== linkUserId) {
      return { ok: false, error: "that GitHub account is already connected to another profile" };
    }

    const updated = (await db().updateDocument(DB_ID, "profiles", linkUserId, {
      githubId: user.id,
      githubLogin: user.login,
    })) as unknown as Profile;

    return { ok: true, profile: updated, created: false };
  }

  if (existing) {
    // Keep the login name current — it is display only, but a stale one is
    // confusing on a profile page.
    if (existing.githubLogin !== user.login) {
      await db()
        .updateDocument(DB_ID, "profiles", existing.$id, { githubLogin: user.login })
        .catch(() => {});
    }
    return { ok: true, profile: existing, created: false };
  }

  const handle = await allocateHandle(user.login);
  const links = [`https://github.com/${user.login}`];
  if (user.blog) links.push(user.blog.startsWith("http") ? user.blog : `https://${user.blog}`);

  try {
    const profile = (await db().createDocument(DB_ID, "profiles", newId("usr"), {
      handle,
      handleLower: handle.toLowerCase(),
      name: user.name?.slice(0, 64) ?? null,
      bio: user.bio?.slice(0, 280) ?? null,
      // No password: this account signs in through GitHub. A random value is
      // stored so the field stays required and no password can ever match it.
      passwordHash: `github$${crypto.randomBytes(32).toString("hex")}`,
      billing: "api",
      links: JSON.stringify(links),
      avatarUrl: user.avatarUrl,
      isPublic: true,
      createdAt: new Date().toISOString(),
      githubId: user.id,
      githubLogin: user.login,
    })) as unknown as Profile;

    return { ok: true, profile, created: true };
  } catch (error) {
    // Two callbacks racing for the same new user: the handle index rejects the
    // loser, and by then the winner's row exists to return.
    if (isConflict(error)) {
      const raced = await findProfileByGithubId(user.id);
      if (raced) return { ok: true, profile: raced, created: false };
    }
    throw error;
  }
}

export async function disconnectGithub(userId: string): Promise<void> {
  await db().updateDocument(DB_ID, "profiles", userId, { githubId: null, githubLogin: null });
}
