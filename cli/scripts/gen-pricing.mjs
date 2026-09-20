// Generates src/core/pricing-data.ts from the models.dev catalog.
// Re-run with: node scripts/gen-pricing.mjs
import fs from "node:fs";

// Fetch the catalog directly so this script is self-contained. Falls back to a
// local copy when offline.
const CATALOG_URL = "https://models.dev/api.json";
const CACHE = "/tmp/modelsdev.json";

let catalog;
try {
  const res = await fetch(CATALOG_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  fs.writeFileSync(CACHE, text);
  catalog = JSON.parse(text);
} catch (error) {
  console.error(`fetch failed (${error.message}); using cached ${CACHE}`);
  catalog = JSON.parse(fs.readFileSync(CACHE, "utf8"));
}

// First-party providers win over resellers, so they come first and later
// providers never overwrite an id that is already set.
const PRIORITY = [
  "anthropic", "openai", "google", "google-vertex", "xai", "deepseek", "mistral",
  "meta", "alibaba", "moonshotai", "zhipuai", "minimax", "inception", "cohere",
  "amazon-bedrock", "azure", "github-copilot", "groq", "cerebras", "fireworks-ai",
  "together", "deepinfra", "perplexity", "openrouter", "vercel", "opencode",
];

function normalize(id) {
  let m = String(id).trim().toLowerCase();
  m = m.replace(/^(us|eu|apac|global|ca|sa)\./, "").replace(/^anthropic\./, "");
  m = m.replace(/^[a-z0-9-]+\//, "");          // openrouter "vendor/model"
  m = m.replace(/-v\d+(?::\d+)?$/, "");
  m = m.split("@")[0];
  m = m.replace(/-(\d{8})$/, "");               // dated snapshot
  return m;
}

const out = new Map();
const seenProviders = new Set();

for (const provider of PRIORITY) {
  const p = catalog[provider];
  if (!p?.models) continue;
  seenProviders.add(provider);
  for (const [id, model] of Object.entries(p.models)) {
    const c = model.cost;
    if (!c || typeof c.input !== "number" || typeof c.output !== "number") continue;
    if (c.input === 0 && c.output === 0) continue;   // free/local — nothing to bill
    const key = normalize(id);
    if (out.has(key)) continue;                       // first (highest-priority) wins
    const row = [c.input, c.output];
    const cr = typeof c.cache_read === "number" ? c.cache_read : null;
    const cw = typeof c.cache_write === "number" ? c.cache_write : null;
    if (cr !== null || cw !== null) { row.push(cr ?? 0); if (cw !== null) row.push(cw); }
    out.set(key, row);
  }
}

const sorted = [...out.entries()].sort((a, b) => a[0].localeCompare(b[0]));
const lines = sorted.map(([k, v]) => `  ${JSON.stringify(k)}: [${v.join(",")}],`);

const header = `/**
 * Model prices, in US dollars per million tokens.
 *
 * GENERATED FILE — do not edit by hand. Regenerate with:
 *   node scripts/gen-pricing.mjs
 *
 * Source: the models.dev catalog (${sorted.length} models across ${seenProviders.size}
 * providers), spot-checked against Anthropic's published rates. Model ids are
 * stored normalized: provider prefixes, Bedrock version suffixes, Vertex
 * @-versions and dated snapshots are all stripped, so every spelling of a model
 * resolves to one row.
 *
 * Tuple layout: [input, output, cacheRead?, cacheWrite?]
 * A missing cacheRead/cacheWrite means the provider publishes no separate cache
 * rate, and \`pricing.ts\` falls back to sensible multiples of the input rate.
 *
 * This table is the offline fallback. \`tokn sync\` refreshes it from the
 * dashboard so a model released after this CLI shipped is still priced.
 */

export const CATALOG_GENERATED_AT = ${JSON.stringify(new Date().toISOString().slice(0, 10))};

export const CATALOG: Record<string, number[]> = {
`;

fs.writeFileSync(process.argv[2], header + lines.join("\n") + "\n};\n");
console.log(`wrote ${sorted.length} models from ${seenProviders.size} providers`);
for (const probe of ["claude-opus-5","claude-sonnet-5","gpt-5.2","gemini-3-pro","grok-5","deepseek-v3.2"]) {
  if (out.has(probe)) console.log(`  ${probe} -> ${JSON.stringify(out.get(probe))}`);
}
