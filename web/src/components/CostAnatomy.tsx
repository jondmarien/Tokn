import type { Anatomy, ReuseBenchmark, BurnRate, WhatIf } from "@/lib/backend";

/**
 * Where the money went, and whether it had to.
 *
 * The point of this panel is one counterintuitive fact: on an agent workload
 * almost all of the bill is cache, and the completion everyone thinks about is
 * under a tenth of it. Showing that changes what someone does next, which is
 * the only reason to put a number on a page.
 *
 * Everything here is measured. Nothing is shown unless there is enough data to
 * mean something: the reuse comparison needs a cohort, the projection needs a
 * few days, and a saving is only named when there is one.
 */

const usd = (n: number): string =>
  n >= 100
    ? `$${Math.round(n).toLocaleString("en-US")}`
    : n >= 1
      ? `$${n.toFixed(2)}`
      : `$${n.toFixed(3)}`;

const pct = (n: number): string => `${(n * 100).toFixed(1)}%`;

/** A per-million rate. Cache reads run to fractions of a cent, so two decimals
 *  would collapse half the column to $0.00. */
const rate = (n: number): string =>
  n >= 1 ? `$${n.toFixed(2)}` : `$${n.toFixed(3)}`;

const compact = (n: number): string => {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(Math.round(n));
};

/** The four buckets as one bar, widest first. */
function Bar({ anatomy }: { anatomy: Anatomy }) {
  const { cost } = anatomy;
  if (cost.total <= 0) return null;

  const parts = [
    { key: "cache read", value: cost.cacheRead, shade: "var(--main)" },
    {
      key: "cache write",
      value: cost.cacheWrite,
      shade: "color-mix(in srgb, var(--main) 55%, var(--sub-alt))",
    },
    {
      key: "output",
      value: cost.output,
      shade: "color-mix(in srgb, var(--main) 25%, var(--sub-alt))",
    },
    { key: "input", value: cost.input, shade: "var(--sub-alt)" },
  ].filter((p) => p.value / cost.total > 0.001);

  return (
    <div
      style={{
        display: "flex",
        height: 6,
        borderRadius: 3,
        overflow: "hidden",
        marginBottom: "1.1rem",
      }}
    >
      {parts.map((p) => (
        <div
          key={p.key}
          title={`${p.key} ${usd(p.value)}`}
          style={{
            width: `${(p.value / cost.total) * 100}%`,
            background: p.shade,
          }}
        />
      ))}
    </div>
  );
}

function Row({
  label,
  cost,
  tokens,
  share,
}: {
  label: string;
  cost: number;
  tokens: number;
  share: number;
}) {
  return (
    <tr>
      <td style={{ padding: "0.3rem 0", color: "var(--text)" }}>{label}</td>
      <td
        style={{
          textAlign: "right",
          color: "var(--sub)",
          paddingRight: "1.1rem",
        }}
      >
        {compact(tokens)}
      </td>
      <td
        style={{
          textAlign: "right",
          color: "var(--text)",
          paddingRight: "1.1rem",
        }}
      >
        {usd(cost)}
      </td>
      <td style={{ textAlign: "right", color: "var(--sub)", width: "3.4rem" }}>
        {pct(share)}
      </td>
    </tr>
  );
}

export function CostAnatomy({
  anatomy,
  benchmark,
  burn,
  whatIf,
}: {
  anatomy: Anatomy;
  benchmark: ReuseBenchmark;
  burn: BurnRate;
  whatIf: WhatIf | null;
}) {
  const { cost, tokens, reuse } = anatomy;
  if (cost.total <= 0) return null;

  const share = (n: number) => n / cost.total;
  // Quoted in the what-if footnote, where it is the reason a blended rate
  // beats comparing list prices.
  const cacheShare = share(cost.cacheRead);

  return (
    <section style={{ marginTop: "2.75rem" }}>
      <p className="block-label" style={{ marginBottom: "0.9rem" }}>
        where the money went
      </p>

      <Bar anatomy={anatomy} />

      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: "0.8125rem",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        <thead>
          <tr className="micro">
            <th
              style={{
                textAlign: "left",
                fontWeight: 400,
                paddingBottom: "0.4rem",
              }}
            >
              bucket
            </th>
            <th
              style={{
                textAlign: "right",
                fontWeight: 400,
                paddingRight: "1.1rem",
              }}
            >
              tokens
            </th>
            <th
              style={{
                textAlign: "right",
                fontWeight: 400,
                paddingRight: "1.1rem",
              }}
            >
              cost
            </th>
            <th style={{ textAlign: "right", fontWeight: 400 }}>share</th>
          </tr>
        </thead>
        <tbody>
          <Row
            label="cache read"
            cost={cost.cacheRead}
            tokens={tokens.cacheRead}
            share={share(cost.cacheRead)}
          />
          <Row
            label="cache write"
            cost={cost.cacheWrite}
            tokens={tokens.cacheWrite5m + tokens.cacheWrite1h}
            share={share(cost.cacheWrite)}
          />
          <Row
            label="output"
            cost={cost.output}
            tokens={tokens.output}
            share={share(cost.output)}
          />
          <Row
            label="input"
            cost={cost.input}
            tokens={tokens.input}
            share={share(cost.input)}
          />
        </tbody>
      </table>

      {reuse.cacheShareOfCost > 0.5 && (
        <p className="micro" style={{ marginTop: "0.9rem", lineHeight: 1.7 }}>
          {pct(reuse.cacheShareOfCost)} of this is cache, not completions.
          Context being re-read each turn, rather than anything typed or
          generated.
        </p>
      )}

      {/* ------------------------------------------------------------ reuse */}

      {reuse.ratio !== null && (
        <div style={{ marginTop: "2rem" }}>
          <p className="block-label" style={{ marginBottom: "0.75rem" }}>
            cache reuse
          </p>

          <p
            style={{
              fontSize: "1.4rem",
              lineHeight: 1.1,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {reuse.ratio.toFixed(1)}
            <span className="sub" style={{ fontSize: "0.9rem" }}>
              :1
            </span>
          </p>

          <p className="micro" style={{ marginTop: "0.5rem", lineHeight: 1.7 }}>
            {compact(reuse.cacheRead)} tokens read back for every{" "}
            {compact(reuse.cacheWrite)} written. Writing to cache costs
            1.25&ndash;2&times; the input rate; reading costs a tenth. Higher is
            better.
          </p>

          {benchmark.median !== null && benchmark.percentile !== null ? (
            <p
              className="micro"
              style={{ marginTop: "0.7rem", lineHeight: 1.7 }}
            >
              Median is {benchmark.median.toFixed(1)}:1 across{" "}
              {benchmark.cohort} people. You are in the{" "}
              {ordinal(benchmark.percentile)} percentile.
              {benchmark.headroomUsd !== null && (
                <>
                  {" "}
                  At the median you would have spent about{" "}
                  <span style={{ color: "var(--text)" }}>
                    {usd(benchmark.headroomUsd)}
                  </span>{" "}
                  less.
                </>
              )}
            </p>
          ) : (
            <p className="micro" style={{ marginTop: "0.7rem" }}>
              Not enough people syncing yet to compare against.
            </p>
          )}

          {benchmark.headroomUsd !== null && (
            <p
              className="micro"
              style={{ marginTop: "0.7rem", lineHeight: 1.7 }}
            >
              Reuse drops when context is rebuilt: starting fresh sessions,
              clearing history, or editing an early turn, which invalidates
              everything cached after it.
            </p>
          )}
        </div>
      )}

      {/* -------------------------------------------------------- burn rate */}

      {burn.projected !== null && (
        <div style={{ marginTop: "2rem" }}>
          <p className="block-label" style={{ marginBottom: "0.75rem" }}>
            this month
          </p>
          <p
            style={{
              fontSize: "0.9375rem",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {usd(burn.monthToDate)} so far
            <span className="sub">
              {" "}
              &middot; {usd(burn.perDay)}/day &middot; on pace for{" "}
              {usd(burn.projected)}
            </span>
          </p>
          <p className="micro" style={{ marginTop: "0.45rem" }}>
            Projection uses the last fortnight, including days with no usage,
            over {burn.daysRemaining} remaining{" "}
            {burn.daysRemaining === 1 ? "day" : "days"}.
          </p>
        </div>
      )}

      {/* ---------------------------------------------------------- what if */}

      {whatIf && whatIf.rows.length > 0 && (
        <div style={{ marginTop: "2rem" }}>
          <p className="block-label" style={{ marginBottom: "0.75rem" }}>
            the same tokens, priced elsewhere
          </p>

          <div className="table-wrap">
            <table className="whatif">
              <thead>
                <tr>
                  <th>model</th>
                  <th className="r">total</th>
                  <th className="r">vs yours</th>
                  <th className="r">effective</th>
                  <th className="r">in</th>
                  <th className="r">out</th>
                  <th className="r">cache read</th>
                </tr>
              </thead>
              <tbody>
                {/* The anchor. Without it the percentages float free of the
                    figure they are measured against. */}
                <tr className="anchor">
                  <td>
                    your mix
                    <span className="micro">
                      {" "}
                      &middot; {whatIf.actualModels.length} models &middot;{" "}
                      {compact(whatIf.tokens)} tokens
                    </span>
                  </td>
                  <td className="r">{usd(whatIf.actualUsd)}</td>
                  <td className="r sub">&mdash;</td>
                  <td className="r">{rate(whatIf.actualBlendedRate)}</td>
                  <td className="r" />
                  <td className="r" />
                  <td className="r" />
                </tr>

                {whatIf.rows.map((row) => {
                  const used = whatIf.actualModels.includes(row.model);
                  const cheaper = row.deltaUsd < 0;
                  return (
                    <tr key={row.model}>
                      <td
                        style={{ color: used ? "var(--main)" : "var(--text)" }}
                      >
                        {row.model.replace(/^claude-/, "")}
                        {used && <span className="micro"> &middot; used</span>}
                      </td>
                      <td className="r">{usd(row.costUsd)}</td>
                      <td
                        className="r"
                        style={{
                          color: cheaper ? "var(--main)" : "var(--sub)",
                        }}
                      >
                        {row.deltaUsd === 0 ? (
                          "—"
                        ) : (
                          <>
                            {cheaper ? "−" : "+"}
                            {usd(Math.abs(row.deltaUsd))}
                            <span className="micro">
                              {" "}
                              {Math.abs(row.deltaPct).toFixed(0)}%
                            </span>
                          </>
                        )}
                      </td>
                      <td className="r">{rate(row.blendedRate)}</td>
                      <td className="r sub">{rate(row.inputRate)}</td>
                      <td className="r sub">{rate(row.outputRate)}</td>
                      <td className="r sub">{rate(row.cacheReadRate)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="micro" style={{ marginTop: "0.8rem", lineHeight: 1.7 }}>
            USD per million tokens. <strong>Effective</strong> applies each rate
            card to your own mix
            {cacheShare > 0.3 ? (
              <>
                , the only comparison that holds when cache reads are{" "}
                {pct(cacheShare)} of the bill
              </>
            ) : null}
            . Published rates only: a weaker model often needs more turns, and
            those are not counted.
          </p>
        </div>
      )}
    </section>
  );
}

function ordinal(n: number): string {
  const suffix =
    n % 100 >= 11 && n % 100 <= 13
      ? "th"
      : (["th", "st", "nd", "rd"][n % 10] ?? "th");
  return `${n}${suffix}`;
}
