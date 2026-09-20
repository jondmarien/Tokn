import {
  db,
  DB_ID,
  hashPassword,
  hashToken,
  newId,
  refreshTotals,
  upsertUsage,
  findProfileByHandle,
  listAllProfiles,
  Query,
  type SyncRow,
} from "../../backend/src/index.ts";
import { PRICING } from "../src/lib/pricing.ts";

/**
 * Fills the database with plausible usage so the leaderboard, profiles and
 * charts can be looked at before anyone has run `tokn sync`.
 *
 * Deterministic: the same seed produces the same board every time, which makes
 * "did my change break the layout" answerable by comparing two screenshots.
 *
 *   npm run seed            add the demo accounts
 *   npm run seed -- --reset wipe everything first
 */

const DEMO_PASSWORD = "tokn1234";
const DAYS = 150;

/** mulberry32 — small, seeded, and good enough for fake data. */
function rng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Persona {
  handle: string;
  name?: string;
  links?: string[];
  bio?: string;
  billing?: "api" | "subscription";
  /** Rough daily request volume on an active day. */
  intensity: number;
  /** Chance a given day has any usage at all. */
  activity: number;
  models: { model: string; weight: number; fast?: boolean }[];
  joinedDaysAgo: number;
}

const PERSONAS: Persona[] = [
  {
    // Deliberately not a real person's handle. This persona used to be
    // "sanscreates", which meant a seed run would claim the handle of an
    // actual account holder — and `--reset` would delete theirs to do it.
    handle: "ctxwindow",
    name: "Dana Okafor",
    links: ["https://github.com/ctxwindow"],
    bio: "building the thing that counts the thing",
    intensity: 210,
    activity: 0.72,
    joinedDaysAgo: 148,
    models: [
      { model: "claude-opus-5", weight: 5 },
      { model: "claude-opus-5", weight: 2, fast: true },
      { model: "claude-sonnet-5", weight: 3 },
      { model: "claude-haiku-4-5", weight: 2 },
    ],
  },
  {
    handle: "keyboardgremlin",
    name: "Ada Wren",
    links: ["https://github.com/keyboardgremlin"],
    intensity: 340,
    activity: 0.88,
    joinedDaysAgo: 150,
    models: [
      { model: "claude-opus-5", weight: 8 },
      { model: "claude-fable-5-1", weight: 2 },
    ],
  },
  {
    handle: "nightbuild",
    name: "Tomas Feld",
    links: ["https://github.com/nightbuild", "https://x.com/nightbuild"],
    bio: "ci runs on vibes",
    intensity: 280,
    activity: 0.8,
    joinedDaysAgo: 140,
    models: [
      { model: "claude-opus-4-8", weight: 5 },
      { model: "claude-sonnet-5", weight: 4 },
    ],
  },
  {
    handle: "rustbelt",
    name: "Marta Kline",
    links: ["https://github.com/rustbelt", "https://linkedin.com/in/rustbelt"],
    billing: "subscription",
    intensity: 190,
    activity: 0.76,
    joinedDaysAgo: 132,
    models: [
      { model: "claude-opus-5", weight: 6 },
      { model: "claude-haiku-4-5", weight: 3 },
    ],
  },
  {
    handle: "pixelpusher",
    name: "Ines Duarte",
    links: ["https://x.com/pixelpusher"],
    intensity: 120,
    activity: 0.62,
    joinedDaysAgo: 120,
    models: [
      { model: "claude-sonnet-5", weight: 7 },
      { model: "claude-haiku-4-5", weight: 3 },
    ],
  },
  {
    handle: "grepwizard",
    name: "Sam Oyelaran",
    links: ["https://github.com/grepwizard"],
    bio: "ripgrep enjoyer",
    intensity: 160,
    activity: 0.7,
    joinedDaysAgo: 118,
    models: [
      { model: "claude-opus-5", weight: 4 },
      { model: "claude-sonnet-4-6", weight: 4 },
    ],
  },
  {
    handle: "mono.repo",
    name: "Priya Raman",
    links: ["https://github.com/monorepo", "https://priya.dev"],
    intensity: 260,
    activity: 0.84,
    joinedDaysAgo: 110,
    models: [
      { model: "claude-opus-5", weight: 7 },
      { model: "claude-opus-5", weight: 3, fast: true },
    ],
  },
  {
    handle: "yakshaver",
    billing: "subscription",
    intensity: 95,
    activity: 0.55,
    joinedDaysAgo: 105,
    models: [
      { model: "claude-sonnet-5", weight: 6 },
      { model: "claude-haiku-4-5", weight: 4 },
    ],
  },
  {
    handle: "prod_on_friday",
    bio: "it works on my machine",
    intensity: 150,
    activity: 0.5,
    joinedDaysAgo: 96,
    models: [
      { model: "claude-opus-4-8", weight: 5 },
      { model: "claude-sonnet-5", weight: 3 },
    ],
  },
  {
    handle: "tabsoverspaces",
    intensity: 80,
    activity: 0.48,
    joinedDaysAgo: 88,
    models: [
      { model: "claude-haiku-4-5", weight: 8 },
      { model: "claude-sonnet-5", weight: 2 },
    ],
  },
  {
    handle: "segfaulty",
    name: "Lena Hoff",
    links: ["https://github.com/segfaulty"],
    intensity: 210,
    activity: 0.66,
    joinedDaysAgo: 80,
    models: [
      { model: "claude-opus-5", weight: 6 },
      { model: "claude-mythos-5-1", weight: 1 },
    ],
  },
  {
    handle: "lintlord",
    name: "Otis Bram",
    links: ["https://linkedin.com/in/lintlord"],
    billing: "subscription",
    intensity: 130,
    activity: 0.6,
    joinedDaysAgo: 74,
    models: [
      { model: "claude-sonnet-5", weight: 5 },
      { model: "claude-sonnet-4-5", weight: 3 },
    ],
  },
  {
    handle: "cachewarm",
    name: "Jun Park",
    links: ["https://github.com/cachewarm", "https://x.com/cachewarm"],
    bio: "1h ttl or nothing",
    intensity: 300,
    activity: 0.78,
    joinedDaysAgo: 66,
    models: [
      { model: "claude-opus-5", weight: 9 },
      { model: "claude-haiku-4-5", weight: 1 },
    ],
  },
  {
    handle: "deadlock",
    intensity: 70,
    activity: 0.42,
    joinedDaysAgo: 60,
    models: [{ model: "claude-sonnet-5", weight: 1 }],
  },
  {
    handle: "chmod777",
    intensity: 175,
    activity: 0.64,
    joinedDaysAgo: 52,
    models: [
      { model: "claude-opus-4-7", weight: 4 },
      { model: "claude-sonnet-5", weight: 4 },
    ],
  },
  {
    handle: "gitblame",
    intensity: 110,
    activity: 0.58,
    joinedDaysAgo: 45,
    models: [
      { model: "claude-sonnet-5", weight: 6 },
      { model: "claude-opus-5", weight: 2 },
    ],
  },
  {
    handle: "npmrage",
    billing: "subscription",
    intensity: 60,
    activity: 0.4,
    joinedDaysAgo: 38,
    models: [{ model: "claude-haiku-4-5", weight: 1 }],
  },
  {
    handle: "vimexit",
    name: "Rae Castillo",
    links: ["https://github.com/vimexit"],
    bio: ":q! eventually",
    intensity: 145,
    activity: 0.62,
    joinedDaysAgo: 30,
    models: [
      { model: "claude-opus-5", weight: 3 },
      { model: "claude-sonnet-5", weight: 5 },
    ],
  },
  {
    handle: "staging_only",
    intensity: 90,
    activity: 0.5,
    joinedDaysAgo: 22,
    models: [{ model: "claude-sonnet-4-6", weight: 1 }],
  },
  {
    handle: "hotfix",
    name: "Dev Nair",
    links: ["https://github.com/hotfix", "https://x.com/hotfix"],
    intensity: 240,
    activity: 0.7,
    joinedDaysAgo: 14,
    models: [
      { model: "claude-opus-5", weight: 5 },
      { model: "claude-opus-5", weight: 4, fast: true },
    ],
  },
  {
    handle: "justonemore",
    intensity: 55,
    activity: 0.66,
    joinedDaysAgo: 9,
    models: [{ model: "claude-haiku-4-5", weight: 1 }],
  },
  {
    handle: "firstcommit",
    intensity: 40,
    activity: 0.55,
    joinedDaysAgo: 4,
    models: [{ model: "claude-sonnet-5", weight: 1 }],
  },
];

function toDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function daysAgo(count: number): Date {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - count);
  return date;
}

/** Same arithmetic the CLI uses, so seeded costs and real ones are comparable. */
function costOf(
  model: string,
  fast: boolean,
  tokens: {
    input: number;
    output: number;
    cacheWrite5m: number;
    cacheWrite1h: number;
    cacheRead: number;
  },
): number {
  const price = PRICING[model];
  if (!price) return 0;

  const inputRate = (fast && price.fast ? price.fast.input : price.input) / 1_000_000;
  const outputRate = (fast && price.fast ? price.fast.output : price.output) / 1_000_000;
  const readRate = inputRate * (price.cacheReadMultiplier ?? 0.1);

  return (
    tokens.input * inputRate +
    tokens.output * outputRate +
    tokens.cacheWrite5m * inputRate * 1.25 +
    tokens.cacheWrite1h * inputRate * 2 +
    tokens.cacheRead * readRate
  );
}

/**
 * Tools are assigned per persona so the board exercises the multi-tool
 * breakdown rather than showing every row as Claude Code.
 */
const TOOLS = ["claude-code", "claude-code", "claude-code", "copilot-cli", "codex"];

async function wipe(): Promise<void> {
  for (const collection of ["usage_daily", "user_totals", "link_codes", "devices", "sessions", "profiles"]) {
    for (;;) {
      const page = await db().listDocuments(DB_ID, collection, [Query.limit(100)]);
      if (page.documents.length === 0) break;
      for (const doc of page.documents) {
        await db().deleteDocument(DB_ID, collection, doc.$id).catch(() => {});
      }
      if (page.documents.length < 100) break;
    }
  }
  console.log("cleared existing data");
}

async function main(): Promise<void> {
  if (process.argv.includes("--reset")) await wipe();

  const now = new Date().toISOString();
  let created = 0;
  let rows = 0;

  for (const [index, persona] of PERSONAS.entries()) {
    if (await findProfileByHandle(persona.handle)) continue;

    // Created directly rather than through createProfile() so the join date
    // can be backdated — the board is more convincing with varied tenure.
    const userId = newId("usr");
    await db().createDocument(DB_ID, "profiles", userId, {
      handle: persona.handle,
      handleLower: persona.handle.toLowerCase(),
      name: persona.name ?? null,
      passwordHash: hashPassword(DEMO_PASSWORD),
      bio: persona.bio ?? null,
      createdAt: daysAgo(persona.joinedDaysAgo).toISOString(),
      billing: persona.billing ?? "api",
      links: persona.links ? JSON.stringify(persona.links) : null,
      avatarUrl: null,
      isPublic: true,
    });
    created++;

    const tool = TOOLS[index % TOOLS.length] ?? "claude-code";
    const random = rng(1337 + index * 977);
    const span = Math.min(DAYS, persona.joinedDaysAgo + 1);
    const batch: SyncRow[] = [];

    for (let back = span - 1; back >= 0; back--) {
      const date = daysAgo(back);
      const weekday = date.getUTCDay();

      // Weekends are quieter, and everyone has stretches where they vanish.
      const weekendPenalty = weekday === 0 || weekday === 6 ? 0.45 : 1;
      if (random() > persona.activity * weekendPenalty) continue;

      // The occasional day where someone leaves an agent running all night.
      const burst = random() < 0.06 ? 2.4 + random() * 2 : 1;
      const dayScale = (0.55 + random() * 0.9) * burst;

      const totalWeight = persona.models.reduce((sum, entry) => sum + entry.weight, 0);

      for (const entry of persona.models) {
        const share = entry.weight / totalWeight;
        const requests = Math.round(persona.intensity * dayScale * share * (0.7 + random() * 0.6));
        if (requests <= 0) continue;

        // Shape roughly matches a real agent session: small prompts, modest
        // completions, and an enormous cache read tail.
        const input = Math.round(requests * (140 + random() * 260));
        const output = Math.round(requests * (320 + random() * 700));
        const cacheWrite1h = Math.round(requests * (900 + random() * 2600));
        const cacheWrite5m = Math.round(cacheWrite1h * (0.05 + random() * 0.2));
        const cacheRead = Math.round(requests * (14_000 + random() * 46_000));

        const tokens = { input, output, cacheWrite5m, cacheWrite1h, cacheRead };

        batch.push({
          day: toDay(date),
          tool,
          model: entry.model,
          fast: entry.fast ?? false,
          requests,
          ...tokens,
          costUsd: Number(costOf(entry.model, entry.fast ?? false, tokens).toFixed(6)),
        });
        rows++;
      }
    }

    await upsertUsage(userId, batch);

    // Every seeded account looks like it has a machine linked.
    await db().createDocument(DB_ID, "devices", newId("dev"), {
      userId,
      tokenHash: hashToken(`seed-token-${persona.handle}`),
      hostname: `${persona.handle.replace(/[^a-z0-9]/gi, "")}-mbp`,
      platform: index % 3 === 0 ? "linux" : "darwin",
      cliVersion: "0.1.0",
      linkedAt: daysAgo(Math.max(persona.joinedDaysAgo - 1, 0)).toISOString(),
      lastSyncAt: daysAgo(Math.floor(random() * 2)).toISOString(),
      revokedAt: null,
    });

    // The leaderboard reads the rollup, not raw rows, so it has to be built.
    await refreshTotals(userId);
    console.log(`  @${persona.handle}: ${batch.length} rows (${tool})`);
  }

  console.log(`\nseeded ${created} accounts, ${rows} usage rows`);
  if (created > 0) {
    console.log(`sign in as any handle with password: ${DEMO_PASSWORD}`);
    console.log(`try:  ctxwindow / ${DEMO_PASSWORD}`);
  } else {
    console.log(`(accounts already existed — pass --reset to rebuild; ${(await listAllProfiles()).length} on file)`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
