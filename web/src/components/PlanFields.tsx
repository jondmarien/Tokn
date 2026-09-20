"use client";

import { useState } from "react";
import {
  KINDS,
  KIND_LABELS,
  MAX_PLANS,
  PROVIDERS,
  type Plan,
} from "@/lib/plans";

/**
 * The plan editor in settings.
 *
 * Rows are plain inputs named `plan.*`, so the surrounding server action reads
 * them straight out of FormData and their order is the order they appear in.
 * A row is only kept if it names a plan, so an empty trailing row costs
 * nothing and there is no explicit "remove" needed to discard a mistake.
 */

interface Row {
  provider: string;
  label: string;
  plan: string;
  kind: string;
  monthly: string;
}

const BLANK: Row = {
  provider: "anthropic",
  label: "",
  plan: "",
  kind: "subscription",
  monthly: "",
};

export function PlanFields({ initial }: { initial: Plan[] }) {
  const [rows, setRows] = useState<Row[]>(
    initial.length > 0
      ? initial.map((plan) => ({
          provider: plan.provider,
          label: plan.label ?? "",
          plan: plan.plan === "—" ? "" : plan.plan,
          kind: plan.kind,
          monthly: plan.monthlyUsd === undefined ? "" : String(plan.monthlyUsd),
        }))
      : [BLANK],
  );

  const update = (index: number, patch: Partial<Row>) =>
    setRows((current) =>
      current.map((row, at) => (at === index ? { ...row, ...patch } : row)),
    );

  return (
    <div style={{ display: "grid", gap: "0.6rem" }}>
      {rows.map((row, index) => (
        <div className="plan-row" key={index}>
          <select
            name="plan.provider"
            className="input"
            value={row.provider}
            onChange={(event) =>
              update(index, { provider: event.target.value })
            }
            aria-label="provider"
          >
            {PROVIDERS.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.name}
              </option>
            ))}
          </select>

          {/* Always submitted so the field indexes stay aligned, even when the
              provider is not "other" and the value is ignored. */}
          <input
            type={row.provider === "other" ? "text" : "hidden"}
            name="plan.label"
            className="input"
            value={row.label}
            onChange={(event) => update(index, { label: event.target.value })}
            placeholder="provider name"
            aria-label="provider name"
          />

          <input
            name="plan.plan"
            className="input"
            value={row.plan}
            onChange={(event) => update(index, { plan: event.target.value })}
            placeholder="max 20x, pro, pay as you go…"
            aria-label="plan"
          />

          <select
            name="plan.kind"
            className="input"
            value={row.kind}
            onChange={(event) => update(index, { kind: event.target.value })}
            aria-label="kind"
          >
            {KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {KIND_LABELS[kind]}
              </option>
            ))}
          </select>

          <div className="money">
            <span>$</span>
            <input
              name="plan.monthly"
              className="input"
              value={row.monthly}
              onChange={(event) =>
                update(index, { monthly: event.target.value })
              }
              placeholder="/mo"
              inputMode="decimal"
              aria-label="monthly cost, optional"
            />
          </div>

          <button
            type="button"
            className="btn bare"
            onClick={() =>
              setRows((current) => current.filter((_, at) => at !== index))
            }
            aria-label="remove this plan"
            title="remove"
          >
            ×
          </button>
        </div>
      ))}

      {rows.length < MAX_PLANS && (
        <button
          type="button"
          className="btn bare"
          style={{ justifySelf: "start", color: "var(--sub)" }}
          onClick={() => setRows((current) => [...current, BLANK])}
        >
          add a plan
        </button>
      )}

      <p className="micro">
        The monthly price is optional. Give it and your profile compares what
        you pay against what the same work would cost at API rates.
      </p>
    </div>
  );
}
