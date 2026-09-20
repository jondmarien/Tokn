import { NextResponse } from "next/server";
import { currentUser, listDevices, readLinkCode } from "@/lib/auth";

/**
 * GET /api/link/status?code= — has the CLI picked this code up yet?
 *
 * Only the code's owner may ask. Without that check the endpoint would let
 * anyone probe which codes are live.
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "sign in first" }, { status: 401 });

  const code = new URL(request.url).searchParams.get("code") ?? "";
  const row = await readLinkCode(code);

  if (!row || row.user_id !== user.id) {
    return NextResponse.json({ status: "expired" });
  }

  if (row.consumed_at) {
    // The device the code minted, found among the user's own — scoping the
    // lookup this way means a stray device id can never leak another account's
    // machine.
    const device = row.device_id
      ? (await listDevices(user.id)).find((candidate) => candidate.id === row.device_id)
      : undefined;

    return NextResponse.json({
      status: "linked",
      device: {
        hostname: device?.hostname ?? undefined,
        platform: device?.platform ?? undefined,
      },
    });
  }

  if (new Date(row.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ status: "expired" });
  }

  return NextResponse.json({ status: "pending", expiresAt: row.expires_at });
}
