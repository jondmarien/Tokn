import { upsertPrices, priceCount, type PriceRow } from "./repo/pricing.ts";

/**
 * Load the model rate table into Appwrite from the models.dev catalog.
 *
 *   npm run seed:pricing
 *
 * This is the same source the CLI generates its built-in fallback from, so the
 * two agree. Serving it from the database is what lets a model released after
 * a CLI version shipped still be priced correctly.
 *
 * Re-runnable: rows are keyed by model id and overwritten.
 */

const CATALOG_URL = "https://models.dev/api.json";

/** First-party providers win over resellers, so they are tried first. */
const PROVIDERS = [
  "anthropic", "openai", "google", "google-vertex", "xai", "deepseek", "mistral",
  "meta", "alibaba", "moonshotai", "zhipuai", "minimax", "inception", "cohere",
  "amazon-bedrock", "azure", "github-copilot", "groq", "cerebras", "fireworks-ai",
  "together", "deepinfra", "perplexity", "openrouter", "vercel", "opencode",
];

/**
 * What the catalog cannot express.
 *
 * models.dev publishes one `cache_write` figure, which is the 5-minute rate.
 * Anthropic's 1-hour tier costs 2x input and dominates real agent workloads —
 * most cache writes in practice are 1h — so leaving it out would understate
 * every Claude Code bill. Fast mode is likewise Anthropic-specific.
 */
const OVERRIDES: Record<string, Partial<PriceRow>> = {
  "claude-opus-5": { cacheWrite1h: 10, fastInput: 10, fastOutput: 50 },
  "claude-opus-4-8": { cacheWrite1h: 10, fastInput: 10, fastOutput: 50 },
  "claude-opus-4-7": { cacheWrite1h: 10 },
  "claude-opus-4-6": { cacheWrite1h: 10 },
  "claude-sonnet-5": { cacheWrite1h: 4 },
  "claude-sonnet-4-6": { cacheWrite1h: 6 },
  "claude-haiku-4-5": { cacheWrite1h: 2 },
  "claude-fable-5": { cacheWrite1h: 20 },
  // Fable 5.1 reads cache at 0.025x rather than the usual 0.1x.
  "claude-fable-5-1": { cacheWrite1h: 20, cacheRead: 0.25 },
};

function normalize(id: string): string {
  let m = id.trim().toLowerCase();
  m = m.replace(/^(us|eu|apac|global|ca|sa)\./, "").replace(/^anthropic\./, "");
  m = m.replace(/^[a-z0-9-]+\//, "");
  m = m.replace(/-v\d+(?::\d+)?$/, "");
  m = m.split("@")[0] ?? m;
  m = m.replace(/-\d{8}$/, "");
  return m;
}

interface CatalogModel {
  cost?: { input?: number; output?: number; cache_read?: number; cache_write?: number };
}

async function main(): Promise<void> {
  console.log(`\n  fetching ${CATALOG_URL} …`);
  const response = await fetch(CATALOG_URL);
  if (!response.ok) throw new Error(`catalog fetch failed: HTTP ${response.status}`);

  const catalog = (await response.json()) as Record<
    string,
    { models?: Record<string, CatalogModel> }
  >;

  const seen = new Map<string, PriceRow>();

  for (const provider of PROVIDERS) {
    const models = catalog[provider]?.models;
    if (!models) continue;

    for (const [id, model] of Object.entries(models)) {
      const cost = model.cost;
      if (!cost || typeof cost.input !== "number" || typeof cost.output !== "number") continue;
      // Free or local providers have nothing to bill.
      if (cost.input === 0 && cost.output === 0) continue;

      const key = normalize(id);
      if (seen.has(key)) continue; // First (highest-priority) provider wins.

      seen.set(key, {
        modelId: key,
        provider,
        input: cost.input,
        output: cost.output,
        cacheRead: typeof cost.cache_read === "number" ? cost.cache_read : null,
        cacheWrite: typeof cost.cache_write === "number" ? cost.cache_write : null,
        ...OVERRIDES[key],
      });
    }
  }

  // Apply any override for a model the catalog does not carry at all.
  for (const [key, override] of Object.entries(OVERRIDES)) {
    if (seen.has(key)) continue;
    if (typeof override.input === "number" && typeof override.output === "number") {
      seen.set(key, { modelId: key, ...override } as PriceRow);
    }
  }

  const rows = [...seen.values()];
  console.log(`  writing ${rows.length} models …`);
  const written = await upsertPrices(rows);

  console.log(`\n  ${written} prices stored. Table now holds ${await priceCount()}.`);

  for (const probe of ["claude-opus-5", "claude-sonnet-5", "gpt-5.2", "gemini-3-pro"]) {
    const row = seen.get(probe);
    if (row) {
      console.log(
        `    ${probe}: in ${row.input} out ${row.output}` +
          (row.cacheWrite1h ? ` cache1h ${row.cacheWrite1h}` : ""),
      );
    }
  }
  console.log();
}

main().catch((error: unknown) => {
  console.error(`\n  seeding failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
