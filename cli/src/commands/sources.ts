import { SOURCES } from "../core/sources/registry.js";
import { catalogSize, CATALOG_GENERATED_AT } from "../core/pricing.js";
import { loadConfig } from "../core/config.js";
import { bold, dim, gray, green, sym, yellow } from "../ui/ansi.js";
import { fullNumber } from "../ui/format.js";
import type { ParsedArgs } from "../args.js";

/**
 * `tokn sources` — which AI tools were found, and which can actually be
 * accounted for.
 *
 * This exists so the distinction is visible. "I don't see Cursor usage" should
 * never be ambiguous between "you didn't use it" and "its usage isn't on this
 * machine to read".
 */

export async function sourcesCommand(args: ParsedArgs): Promise<number> {
  const out = process.stdout;
  const config = await loadConfig();

  const results = await Promise.all(
    SOURCES.map(async (source) => {
      try {
        return { source, availability: await source.detect() };
      } catch (error) {
        return {
          source,
          availability: { state: "unavailable" as const, reason: (error as Error).message },
        };
      }
    }),
  );

  if (args.flags.json === true) {
    out.write(
      JSON.stringify(
        {
          sources: results.map((r) => ({
            id: r.source.id,
            name: r.source.name,
            state: r.availability.state,
            reason: "reason" in r.availability ? r.availability.reason : undefined,
          })),
          pricing: {
            models: catalogSize(),
            generatedAt: CATALOG_GENERATED_AT,
            refreshedAt: config.pricing?.fetchedAt,
          },
        },
        null,
        2,
      ) + "\n",
    );
    return 0;
  }

  const tracked = results.filter((r) => r.availability.state === "ready");
  const blocked = results.filter(
    (r) => r.availability.state === "no-local-usage" || r.availability.state === "unavailable",
  );
  const absent = results.filter((r) => r.availability.state === "absent");

  out.write(`\n  ${bold("Tracked")}\n`);
  if (tracked.length === 0) {
    out.write(`    ${dim("Nothing found on this machine.")}\n`);
  }
  for (const { source } of tracked) {
    out.write(`    ${green(sym.tick)} ${source.name}\n`);
  }

  if (blocked.length > 0) {
    out.write(`\n  ${bold("Found, but not countable")}\n`);
    for (const { source, availability } of blocked) {
      const reason = "reason" in availability ? availability.reason : "";
      out.write(`    ${yellow(sym.cross)} ${source.name} ${dim(`— ${reason}`)}\n`);
    }
  }

  if (absent.length > 0) {
    out.write(
      `\n  ${dim("Not installed:")} ${dim(absent.map((r) => r.source.name).join(", "))}\n`,
    );
  }

  out.write(
    `\n  ${dim("Pricing:")} ${fullNumber(catalogSize())} models ${dim(`(catalog ${CATALOG_GENERATED_AT}`)}`,
  );
  out.write(
    config.pricing?.fetchedAt
      ? dim(`, refreshed ${config.pricing.fetchedAt.slice(0, 10)})`) + "\n"
      : dim(")") + "\n",
  );
  out.write(
    `  ${dim("A model with no known rate is reported unpriced, never counted as")} ${gray("$0")}${dim(".")}\n\n`,
  );

  return 0;
}
