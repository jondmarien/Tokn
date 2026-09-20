import { listUsage, type UsageDoc } from "./usage.ts";
import { pricingTable, type CliPrice } from "./pricing.ts";

/**
 * What the same work would have cost on a different model.
 *
 * Honest because it re-prices the user's own token shape rather than a
 * benchmark. That matters: a workload that is 97% cache reads prices very
 * differently from one that is mostly output, and a generic "model X is
 * cheaper" claim gets it wrong in both directions.
 *
 * It answers a narrow question — *what would these exact tokens have cost* —
 * and deliberately does not claim the work would have gone the same way. A
 * weaker model may need more turns to reach the same place, and that is not
 * something usage data can see.
 */

const CACHE_READ_MULTIPLIER = 0.1;
const CACHE_WRITE_5M_MULTIPLIER = 1.25;
const CACHE_WRITE_1H_MULTIPLIER = 2.0;
const PER_MILLION = 1_000_000;

export interface WhatIfRow {
  model: string;
  costUsd: number;
  /** Difference against what was actually paid. Negative is cheaper. */
  deltaUsd: number;
  /** Same as a fraction of actual spend, for sorting and labels. */
  deltaPct: number;
  /** Published rates, USD per million tokens. */
  inputRate: number;
  outputRate: number;
  cacheReadRate: number;
  /**
   * What this model works out to across *this* token mix, per million.
   *
   * The single most useful number in the row: list rates cannot be compared
   * directly when one workload is 97% cache reads and another is mostly
   * output. This collapses a model's whole rate card down to what it would
   * actually have charged for these tokens.
   */
  blendedRate: number;
}

export interface WhatIf {
  actualUsd: number;
  /** The models that carried this usage, for showing what is being replaced. */
  actualModels: string[];
  /** Tokens being repriced, so the blended rates can be checked by hand. */
  tokens: number;
  /** The blended rate actually paid, for comparison with each row. */
  actualBlendedRate: number;
  rows: WhatIfRow[];
}

function priceRows(rows: UsageDoc[], price: CliPrice): number {
  const readRate = price.cacheRead ?? price.input * CACHE_READ_MULTIPLIER;
  const write5m = price.cacheWrite ?? price.input * CACHE_WRITE_5M_MULTIPLIER;
  const write1h = price.cacheWrite1h ?? price.input * CACHE_WRITE_1H_MULTIPLIER;

  let total = 0;
  for (const row of rows) {
    total +=
      (row.input / PER_MILLION) * price.input +
      (row.output / PER_MILLION) * price.output +
      (row.cacheWrite5m / PER_MILLION) * write5m +
      (row.cacheWrite1h / PER_MILLION) * write1h +
      (row.cacheRead / PER_MILLION) * readRate;
  }
  return total;
}

/**
 * Candidates are limited to models people actually code with. Pricing the
 * whole 700-model catalog would bury the answer in models nobody would run a
 * coding agent on.
 */
const CANDIDATES = [
  "claude-opus-5",
  "claude-sonnet-5",
  "claude-haiku-4-5",
  "claude-opus-4-8",
  "claude-fable-5-1",
  "gpt-5.2",
  "gemini-3-pro",
];

export async function whatIf(userId: string, since?: string): Promise<WhatIf> {
  const rows = await listUsage(userId, since ? { since } : {});
  const actualUsd = rows.reduce((sum, r) => sum + r.costUsd, 0);

  const models = [...new Set(rows.map((r) => r.model))];
  const tokens = rows.reduce(
    (sum, r) => sum + r.input + r.output + r.cacheWrite5m + r.cacheWrite1h + r.cacheRead,
    0,
  );
  const perMillion = (usd: number) => (tokens > 0 ? (usd / tokens) * PER_MILLION : 0);

  const out: WhatIf = {
    actualUsd,
    actualModels: models,
    tokens,
    actualBlendedRate: perMillion(actualUsd),
    rows: [],
  };
  if (rows.length === 0 || actualUsd <= 0) return out;

  const prices = await pricingTable();

  for (const model of CANDIDATES) {
    const price = prices[model];
    if (!price) continue;

    const costUsd = priceRows(rows, price);
    out.rows.push({
      model,
      costUsd,
      deltaUsd: costUsd - actualUsd,
      deltaPct: ((costUsd - actualUsd) / actualUsd) * 100,
      inputRate: price.input,
      outputRate: price.output,
      cacheReadRate: price.cacheRead ?? price.input * CACHE_READ_MULTIPLIER,
      blendedRate: perMillion(costUsd),
    });
  }

  out.rows.sort((a, b) => a.costUsd - b.costUsd);
  return out;
}
