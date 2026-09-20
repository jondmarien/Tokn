/**
 * Declared subscriptions and API accounts.
 *
 * This is the one part of a profile that is *stated* rather than measured.
 * Everything else on the site comes from session logs; a plan is something
 * only its owner knows, so nothing here is verified and the profile says so
 * plainly rather than implying the same confidence as the figures around it.
 *
 * The monthly price is optional on purpose. It is what makes the section
 * interesting — a subscription next to the API-rate value of the work it
 * carried — and also the most personal thing on the page, so nobody is made to
 * publish it to list a provider.
 */

export const PROVIDERS = [
  { id: "anthropic", name: "Anthropic" },
  { id: "openai", name: "OpenAI" },
  { id: "google", name: "Google" },
  { id: "xai", name: "xAI" },
  { id: "mistral", name: "Mistral" },
  { id: "deepseek", name: "DeepSeek" },
  { id: "github", name: "GitHub Copilot" },
  { id: "cursor", name: "Cursor" },
  { id: "windsurf", name: "Windsurf" },
  { id: "openrouter", name: "OpenRouter" },
  { id: "together", name: "Together" },
  { id: "groq", name: "Groq" },
  { id: "fireworks", name: "Fireworks" },
  { id: "bedrock", name: "Amazon Bedrock" },
  { id: "azure", name: "Azure OpenAI" },
  { id: "vertex", name: "Google Vertex" },
  { id: "other", name: "Other" },
] as const;

export type ProviderId = (typeof PROVIDERS)[number]["id"];

const PROVIDER_IDS = PROVIDERS.map(
  (provider) => provider.id,
) as readonly string[];

export const KINDS = ["subscription", "api"] as const;
export type PlanKind = (typeof KINDS)[number];

export const KIND_LABELS: Record<PlanKind, string> = {
  subscription: "subscription",
  api: "api",
};

export interface Plan {
  provider: ProviderId;
  /** Used only when the provider is "other"; otherwise the catalogue name wins. */
  label?: string;
  /** Short and free-form: "Max 20x", "Pro", "Team", "pay as you go". */
  plan: string;
  kind: PlanKind;
  /** Optional. Zero and absent are different things, so this stays undefined. */
  monthlyUsd?: number;
}

/** Enough for a realistic stack without turning a profile into a directory. */
export const MAX_PLANS = 8;

const MAX_LABEL = 32;
const MAX_PLAN_NAME = 40;
const MAX_MONTHLY = 100_000;

export function providerName(plan: Plan): string {
  if (plan.provider === "other") return plan.label?.trim() || "Other";
  return (
    PROVIDERS.find((provider) => provider.id === plan.provider)?.name ??
    plan.provider
  );
}

/* ------------------------------------------------------------- read/write */

/** Total of the plans that named a price. Plans without one are not guessed at. */
export function monthlyTotal(plans: Plan[]): number {
  return plans.reduce((sum, plan) => sum + (plan.monthlyUsd ?? 0), 0);
}

/**
 * Total of the priced *subscriptions*.
 *
 * Only a flat fee can be compared against usage. An API plan's monthly figure
 * is the usage — billed at the same rates the site prices everything at — so
 * saying it "returned" a multiple of itself is meaningless.
 */
export function subscriptionMonthly(plans: Plan[]): number {
  return plans.reduce(
    (sum, plan) =>
      plan.kind === "subscription" ? sum + (plan.monthlyUsd ?? 0) : sum,
    0,
  );
}

export function hasPricedPlan(plans: Plan[]): boolean {
  return plans.some(
    (plan) => typeof plan.monthlyUsd === "number" && plan.monthlyUsd > 0,
  );
}

function clean(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function normalize(value: unknown): Plan | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Record<string, unknown>;

  const provider = PROVIDER_IDS.includes(raw.provider as string)
    ? (raw.provider as ProviderId)
    : null;
  if (!provider) return null;

  const plan = clean(raw.plan, MAX_PLAN_NAME);
  const label = clean(raw.label, MAX_LABEL);

  // A row with no plan named and no custom label carries nothing.
  if (!plan && !(provider === "other" && label)) return null;

  const monthlyRaw =
    typeof raw.monthlyUsd === "number"
      ? raw.monthlyUsd
      : Number(raw.monthlyUsd);
  const monthlyUsd =
    Number.isFinite(monthlyRaw) && monthlyRaw > 0
      ? Math.min(Math.round(monthlyRaw * 100) / 100, MAX_MONTHLY)
      : undefined;

  return {
    provider,
    ...(provider === "other" && label ? { label } : {}),
    plan: plan || "—",
    kind: raw.kind === "api" ? "api" : "subscription",
    ...(monthlyUsd === undefined ? {} : { monthlyUsd }),
  };
}

export function parsePlans(stored: string | null | undefined): Plan[] {
  if (!stored) return [];

  let raw: unknown;
  try {
    raw = JSON.parse(stored);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];

  return raw
    .map(normalize)
    .filter((plan): plan is Plan => plan !== null)
    .slice(0, MAX_PLANS);
}

/** Clean a submitted set for storage, or null when nothing survives. */
export function serializePlans(values: unknown[]): string | null {
  const plans = values
    .map(normalize)
    .filter((plan): plan is Plan => plan !== null)
    .slice(0, MAX_PLANS);

  return plans.length > 0 ? JSON.stringify(plans) : null;
}

/**
 * Rebuild the coarse billing flag from the declared plans.
 *
 * The leaderboard shows a `plan` tag from `profiles.billing`, and leaving that
 * to be set separately is how the two end up contradicting each other on the
 * same page. Any subscription in the list means the headline figure is not a
 * bill.
 */
export function billingFromPlans(plans: Plan[], fallback: string): string {
  if (plans.length === 0) return fallback;
  return plans.some((plan) => plan.kind === "subscription")
    ? "subscription"
    : "api";
}
