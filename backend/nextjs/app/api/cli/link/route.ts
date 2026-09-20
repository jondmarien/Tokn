import { NextResponse } from "next/server";
import { cliLink } from "@/lib/backend";

/**
 * POST /api/cli/link — trade a dashboard-issued code for a device token.
 *
 * Unauthenticated: the code *is* the credential. It is single-use and expires
 * in minutes, and the token it returns is stored only as a hash.
 */

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "expected a JSON body" }, { status: 400 });
  }

  const result = await cliLink(body as never);

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result);
}
