import { NextResponse } from "next/server";
import { changeHandle, currentUser, saveProfile } from "@/lib/auth";
import { AVATAR_STYLES, parsePrefs, serializePrefs, type AvatarStyle } from "@/lib/prefs";

/**
 * POST /api/onboarding/profile — set handle, display name and avatar together.
 *
 * The settings page does this as a Server Action, but the welcome flow is a
 * client component that has to stay on the page afterwards, so it needs an
 * endpoint it can await rather than a form that navigates.
 *
 * The handle is changed first and its failure is terminal. A rejected handle
 * that still saved the name would leave the reader looking at a form where
 * half of what they typed took and half did not, with one error message to
 * explain it.
 */

export const dynamic = "force-dynamic";

const MAX_NAME = 60;

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "sign in first" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as {
    handle?: unknown;
    name?: unknown;
    avatar?: unknown;
  } | null;
  if (!body) return NextResponse.json({ error: "bad request" }, { status: 400 });

  const current = parsePrefs(user.prefs);
  const wanted = typeof body.handle === "string" ? body.handle.trim() : "";
  const name = typeof body.name === "string" ? body.name.trim().slice(0, MAX_NAME) : "";
  const avatar = (AVATAR_STYLES as readonly string[]).includes(String(body.avatar))
    ? (body.avatar as AvatarStyle)
    : current.avatar;

  let handle = user.handle;
  let changesLeft: number | null = null;

  if (wanted && wanted !== user.handle) {
    const renamed = await changeHandle(user.id, wanted);
    if (!renamed.ok) return NextResponse.json({ error: renamed.error }, { status: 400 });
    handle = renamed.handle;
    changesLeft = renamed.changesLeft;
  }

  // `saveProfile` writes the whole row and stores `null` for every field it is
  // not handed — it is a replace, not a patch. Reading the current values back
  // out and passing them through is the only thing stopping this step from
  // wiping a bio, links or declared plans the account already had.
  await saveProfile(user.id, {
    name: name || null,
    bio: user.bio,
    billing: user.billing,
    links: user.links,
    plans: user.plans,
    prefs: serializePrefs({ ...current, avatar }),
    isPublic: user.isPublic,
    listed: user.listed,
  });

  return NextResponse.json({ ok: true, handle, changesLeft });
}
