import { NextResponse } from "next/server";
import { pricingTable } from "@/lib/backend";

/**
 * GET /api/cli/pricing — the rate table the CLI prices a scan against.
 *
 * Unauthenticated on purpose: it is public information, and `tokn scan` works
 * before a machine is linked. Serving it from the database is what lets a model
 * released after a CLI version shipped still be priced correctly.
 */

export const revalidate = 3600;

export async function GET() {
  return NextResponse.json(
    { models: await pricingTable(), updatedAt: new Date().toISOString() },
    { headers: { "cache-control": "public, max-age=3600, stale-while-revalidate=86400" } },
  );
}
