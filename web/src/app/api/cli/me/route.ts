import { NextResponse } from "next/server";
import { authenticateDevice, toPublicUser } from "@/lib/auth";
import { syncInfo } from "@/lib/stats";

/**
 * GET /api/cli/me — who this device token belongs to.
 *
 * Returns the device alongside the user so `tokn status` can show when this
 * machine last synced without a second round trip.
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await authenticateDevice(request.headers.get("authorization"));
  if (!auth) {
    return NextResponse.json({ error: "this machine is no longer linked" }, { status: 401 });
  }

  const sync = await syncInfo(auth.user.id);

  return NextResponse.json({
    user: toPublicUser(auth.user),
    device: {
      id: auth.device.id,
      hostname: auth.device.hostname ?? undefined,
      platform: auth.device.platform ?? undefined,
      cliVersion: auth.device.cli_version ?? undefined,
      linkedAt: auth.device.linked_at,
      lastSyncAt: auth.device.last_sync_at ?? undefined,
    },
    devices: sync.devices,
  });
}
