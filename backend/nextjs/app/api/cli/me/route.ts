import { NextResponse } from "next/server";
import { cliMe } from "@/lib/backend";

/** GET /api/cli/me — who this device token belongs to. */

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const result = await cliMe(request.headers.get("authorization"));

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result);
}
