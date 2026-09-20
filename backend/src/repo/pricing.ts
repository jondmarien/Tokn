import { db, DB_ID, Query } from "../client.ts";
import { pricingRowId } from "../ids.ts";

/**
 * The rate table served to the CLI at `GET /api/cli/pricing`.
 *
 * Holding pricing server-side is what lets a model released after a CLI version
 * shipped still be priced correctly — the CLI treats whatever it fetches as
 * authoritative and falls back to its built-in catalog only when offline.
 *
 * Rates are USD per million tokens.
 */

export interface PriceRow {
  modelId: string;
  provider?: string | null;
  input: number;
  output: number;
  cacheRead?: number | null;
  cacheWrite?: number | null;
  /** Anthropic's 1-hour cache tier; no other provider exposes one. */
  cacheWrite1h?: number | null;
  fastInput?: number | null;
  fastOutput?: number | null;
}

/** The shape the CLI expects back. */
export interface CliPrice {
  input: number;
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
  cacheWrite1h?: number;
  fast?: { input: number; output: number };
}

export async function upsertPrices(rows: PriceRow[]): Promise<number> {
  if (rows.length === 0) return 0;
  const now = new Date().toISOString();
  const BATCH = 100;

  const documents = rows.map((row) => ({
    $id: pricingRowId(row.modelId),
    modelId: row.modelId.toLowerCase(),
    provider: row.provider ?? null,
    input: row.input,
    output: row.output,
    cacheRead: row.cacheRead ?? null,
    cacheWrite: row.cacheWrite ?? null,
    cacheWrite1h: row.cacheWrite1h ?? null,
    fastInput: row.fastInput ?? null,
    fastOutput: row.fastOutput ?? null,
    updatedAt: now,
  }));

  let written = 0;
  for (let i = 0; i < documents.length; i += BATCH) {
    const chunk = documents.slice(i, i + BATCH);
    await db().upsertDocuments(DB_ID, "pricing", chunk as never);
    written += chunk.length;
  }
  return written;
}

/** Every price, as the map the CLI consumes. */
export async function pricingTable(): Promise<Record<string, CliPrice>> {
  const out: Record<string, CliPrice> = {};
  let cursor: string | undefined;
  const PAGE = 100;

  for (;;) {
    const queries = [Query.limit(PAGE), Query.orderAsc("$id")];
    if (cursor) queries.push(Query.cursorAfter(cursor));

    const page = await db().listDocuments(DB_ID, "pricing", queries);
    const docs = page.documents as unknown as (PriceRow & { $id: string })[];

    for (const row of docs) {
      const price: CliPrice = { input: row.input, output: row.output };
      if (row.cacheRead != null) price.cacheRead = row.cacheRead;
      if (row.cacheWrite != null) price.cacheWrite = row.cacheWrite;
      if (row.cacheWrite1h != null) price.cacheWrite1h = row.cacheWrite1h;
      if (row.fastInput != null && row.fastOutput != null) {
        price.fast = { input: row.fastInput, output: row.fastOutput };
      }
      out[row.modelId] = price;
    }

    if (docs.length < PAGE) break;
    cursor = docs[docs.length - 1]?.$id;
    if (!cursor) break;
  }

  return out;
}

export async function priceCount(): Promise<number> {
  const page = await db().listDocuments(DB_ID, "pricing", [Query.limit(1)]);
  return page.total;
}
