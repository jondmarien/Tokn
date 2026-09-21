import { money, percent } from "@/lib/format";
import type { Anatomy, ReuseBenchmark, WhatIf } from "@/lib/backend";

/**
 * What this account could have spent less of, and how.
 *
 * Every number here was already being computed. `headroomUsd` existed in one
 * UI file, and the model comparison was a table near the bottom of a long
 * page — so the two facts that answer "am I wasting money" were present,
 * unranked, and separated by three sections. This puts them together, ranked,
 * and leads with the largest single change — the only figure anyone acts on.
 *
 * ## The arithmetic, stated plainly
 *
 * `headroomUsd` **is already the saving** — `headroom()` computes
 * `(cacheWrite - wouldWrite) * perToken` and names the result `saved`. It is
 * null when the reader is at or above the median, since there is nothing to
 * recover. The first version of this file subtracted it from total spend,
 * which inflated a $151 saving into $3,403 and produced a headline claiming
 * one account could have saved 141% of everything it spent.
 *
 * The model figure is the best `deltaUsd` across the what-if rows: the same
 * token counts repriced at another model's rates.
 *
 * ## What it refuses to do
 *
 * Both figures are all-time, because `anatomyFor` and `whatIf` are called
 * without a window. They are labelled that way rather than divided by a
 * guessed number of months — a monthly figure would be the more useful thing
 * to show and the easier thing to get wrong, and an invented rate on a page
 * about wasted money is the exact wrong place to be approximately right.
 *
 * Nothing renders when there is nothing to save. An account already above the
 * median reuse, on the cheapest model for its work, gets no panel at all
 * rather than a zero — there is no advice to give, and inventing some would
 * make every other number on the page less trustworthy.
 */

interface Saving {
  key: string;
  label: string;
  amount: number;
  detail: string;
}

export function Savings({
  anatomy,
  benchmark,
  whatIf,
  own,
}: {
  anatomy: Anatomy;
  benchmark: ReuseBenchmark;
  whatIf: WhatIf | null;
  own?: boolean;
}) {
  const spent = anatomy.cost.total;
  const savings: Saving[] = [];

  /* --------------------------------------------------------- cache reuse */

  if (benchmark.headroomUsd !== null && benchmark.headroomUsd > 0) {
    const amount = benchmark.headroomUsd;
    const ratio = benchmark.ratio;
    const median = benchmark.median;
    savings.push({
      key: "reuse",
      label: "cache reuse",
      amount,
      detail:
        ratio !== null && median !== null
          ? `${own ? "your" : "their"} reads-to-writes is ${ratio.toFixed(1)}:1 against a median of ` +
            `${median.toFixed(1)}:1 across ${benchmark.cohort} accounts`
          : `at the median reuse ratio across ${benchmark.cohort} accounts`,
    });
  }

  /* -------------------------------------------------------- model choice */

  const cheapest = whatIf?.rows
    .filter((row) => row.deltaUsd < 0 && !whatIf.actualModels.includes(row.model))
    .sort((a, b) => a.deltaUsd - b.deltaUsd)[0];

  if (cheapest) {
    savings.push({
      key: "model",
      label: "model choice",
      amount: Math.abs(cheapest.deltaUsd),
      detail: `the same tokens priced at ${cheapest.model} rates`,
    });
  }

  // No advice to give. Saying so with a zero would be worse than silence.
  if (savings.length === 0 || spent <= 0) return null;

  savings.sort((a, b) => b.amount - a.amount);

  /**
   * The headline is the largest single change, not the sum.
   *
   * The two savings overlap: repricing the same tokens at a cheaper model also
   * changes what better cache reuse is worth. Adding them produced totals that
   * exceeded what the account had ever spent, which is self-evidently wrong no
   * matter what disclaimer sits under it. One number that is actually true and
   * achievable on its own beats a bigger one that needs a footnote.
   */
  const best = savings[0]!;

  return (
    <section>
      <p className="block-label">what {own ? "you" : "they"} could have spent less</p>
      <p className="block-value save-total">{money(best.amount, 2)}</p>
      <p className="micro" style={{ marginTop: "0.2rem" }}>
        the best single change, {percent(best.amount, spent)} of the {money(spent, 2)}{" "}
        {own ? "you have" : "they have"} spent, all time
      </p>

      <ul className="save-list">
        {savings.map((saving) => (
          <li key={saving.key}>
            <span className="save-what">{saving.label}</span>
            <span className="save-amount">{money(saving.amount, 2)}</span>
            <span className="save-why">{saving.detail}</span>
          </li>
        ))}
      </ul>

      {savings.length > 1 && (
        <p className="micro" style={{ marginTop: "0.9rem" }}>
          These overlap — fixing one changes what the other is worth, so they do not
          add up.
        </p>
      )}
    </section>
  );
}
