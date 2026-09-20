import { NextResponse } from "next/server";
import { cliSync } from "@/lib/backend";

/**
 * POST /api/cli/sync — store one scan.
 *
 * The CLI re-uploads its whole history every run, so rows are upserted on
 * (user, day, tool, model, fast) and **replace** rather than accumulate. That
 * is what lets a corrected scan heal whatever the last one got wrong; without
 * it a second sync would double every number on the leaderboard.
 *
 * All of the logic lives in the backend service so this route and the
 * standalone server cannot drift apart.
 */

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "expected a JSON body" }, { status: 400 });
  }

  const result = await cliSync(request.headers.get("authorization"), body as never);

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result);
}
