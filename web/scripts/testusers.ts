import crypto from "node:crypto";
import {
  db,
  DB_ID,
  hashPassword,
  refreshTotals,
  upsertUsage,
  Query,
  type SyncRow,
} from "../../backend/src/index.ts";

/**
 * Fifty throwaway accounts, so the leaderboard has rows to test against.
 *
 *   node --experimental-strip-types scripts/testusers.ts            add them
 *   node --experimental-strip-types scripts/testusers.ts --remove   take them away
 *   node --experimental-strip-types scripts/testusers.ts --list     see what exists
 *
 * Handles only. No bio, links, avatar, plans or devices — just enough for each
 * to appear on the board, which needs a listed profile and some usage, because
 * the board drops anyone whose ranked metric is zero.
 *
 * Two properties matter more than anything else here, because this writes into
 * a database that has real accounts in it:
 *
 *   Removable. Every document id is derived from the handle, so `--remove`
 *   deletes exactly these fifty and cannot touch anything else. No pattern
 *   matching on handles, no "delete everything created today".
 *
 *   Idempotent. Re-running adds nothing and duplicates nothing, for the same
 *   reason: the ids are already known.
 *
 * Deliberately separate from `seed.ts`. That script builds a believable demo
 * with profiles worth looking at; this one makes noise to scroll through, and
 * mixing the two would mean you could not delete one without the other.
 */

const MARK = "tokntest";

/** Ids are `t` + 35 hex, mirroring the shape the rest of the schema uses. */
function testUserId(handle: string): string {
  const hash = crypto.createHash("sha256").update(`${MARK}|${handle}`).digest("hex");
  return `t${hash.slice(0, 35)}`;
}

/* ------------------------------------------------------------------ names */

const FIRST = [
  "nil", "byte", "gray", "loop", "fold", "kern", "drift", "patch", "stack", "quiet",
  "nine", "ember", "flux", "null", "prime", "raw", "slate", "tide", "vector", "warp",
  "atlas", "basalt", "cinder", "delta", "echo",
];
const SECOND = [
  "shell", "commit", "branch", "daemon", "socket", "kernel", "buffer", "lambda",
  "cursor", "runner", "thread", "packet", "vertex", "cipher", "beacon", "anchor",
  "signal", "harbor", "lattice", "marrow",
];

/**
 * Fifty handles, generated from two fixed word lists rather than at random, so
 * the same fifty come back on every run. A random set would make `--remove`
 * unable to find what a previous run created.
 */
function handles(): string[] {
  const out: string[] = [];
  for (let i = 0; out.length < 50; i++) {
    const first = FIRST[i % FIRST.length]!;
    const second = SECOND[(i * 7 + Math.floor(i / FIRST.length) * 3) % SECOND.length]!;
    const name = `${first}${second}`;
    if (!out.includes(name)) out.push(name);
  }
  return out;
}

/* ------------------------------------------------------------------ usage */

const MODELS = ["claude-opus-5", "claude-sonnet-5", "claude-haiku-4-5", "gpt-5.2"];
const TOOLS = ["claude-code", "codex", "copilot-cli"];

/** A small deterministic PRNG, so the same handle always gets the same numbers. */
function rng(seed: string): () => number {
  let h = Number.parseInt(crypto.createHash("sha256").update(seed).digest("hex").slice(0, 8), 16);
  return () => {
    h = (h * 1103515245 + 12345) & 0x7fffffff;
    return h / 0x7fffffff;
  };
}

function day(offset: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - offset);
  return d.toISOString().slice(0, 10);
}

/**
 * Spend is spread across roughly $3–$1,800 and kept under the real accounts at
 * the top, so a test set fills the board out without rewriting who is winning
 * it. Days land inside the last fortnight so the sparkline column has a shape
 * to draw.
 */
function usageFor(handle: string, index: number): SyncRow[] {
  const rand = rng(handle);
  const scale = 3 + (index / 50) ** 2.2 * 1800;
  const count = 2 + Math.floor(rand() * 5);
  const rows: SyncRow[] = [];

  // A usage row's id is derived from (day, tool, model, fast), so two rows
  // sharing all four are the same document. Picking days at random produced
  // collisions *within one batch*, which the bulk upsert rejects outright —
  // one duplicate fails the whole write. Distinct days, one row each, makes
  // the ids unique by construction.
  const offsets = Array.from({ length: 13 }, (_, i) => i + 1);
  for (let i = offsets.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [offsets[i], offsets[j]] = [offsets[j]!, offsets[i]!];
  }
  const days = offsets.slice(0, count);

  for (const offset of days) {
    const model = MODELS[Math.floor(rand() * MODELS.length)]!;
    const tool = TOOLS[Math.floor(rand() * TOOLS.length)]!;
    const share = (0.5 + rand()) / days.length;
    const cost = scale * share;

    // Token counts are shaped like a real agent workload — overwhelmingly
    // cache reads — so anything that reasons about the mix sees something
    // plausible rather than a flat split.
    const cacheRead = Math.round(cost * 1_900_000);
    rows.push({
      day: day(offset),
      tool,
      model,
      requests: 20 + Math.round(rand() * 400),
      input: Math.round(cacheRead * 0.0004),
      output: Math.round(cacheRead * 0.004),
      cacheWrite5m: Math.round(cacheRead * 0.03),
      cacheWrite1h: 0,
      cacheRead,
      costUsd: Number(cost.toFixed(4)),
      fast: false,
    });
  }
  return rows;
}

/* ----------------------------------------------------------------- actions */

async function existing(): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  for (const handle of handles()) {
    const id = testUserId(handle);
    try {
      await db().getDocument(DB_ID, "profiles", id);
      found.set(handle, id);
    } catch {
      // Not there; nothing to record.
    }
  }
  return found;
}

async function add(): Promise<void> {
  const list = handles();
  const now = new Date().toISOString();
  let created = 0;
  let skipped = 0;
  let rows = 0;

  for (const [index, handle] of list.entries()) {
    const id = testUserId(handle);

    // A handle already taken by a real account must never be overwritten. The
    // id check alone would not catch that: a person could have registered one
    // of these names, and it would be theirs, not ours to reuse.
    const clash = await db().listDocuments(DB_ID, "profiles", [
      Query.equal("handleLower", handle.toLowerCase()),
      Query.limit(1),
    ]);
    const theirs = clash.documents[0] as { $id?: string } | undefined;
    if (theirs && theirs.$id !== id) {
      console.log(`  ! ${handle} is already a real account — left alone`);
      skipped++;
      continue;
    }

    try {
      await db().createDocument(DB_ID, "profiles", id, {
        handle,
        handleLower: handle.toLowerCase(),
        name: null,
        bio: null,
        // Random and thrown away. These accounts exist to be listed, not
        // signed into, and a shared known password in a database that also
        // holds real accounts is not worth the convenience.
        passwordHash: hashPassword(crypto.randomBytes(24).toString("hex")),
        billing: "api",
        links: null,
        avatarUrl: null,
        isPublic: true,
        createdAt: now,
      });
      created++;
    } catch {
      skipped++;
    }

    rows += await upsertUsage(id, usageFor(handle, index));
    await refreshTotals(id);
  }

  console.log(`\n  created ${created}, already present ${skipped}, usage rows ${rows}`);
  console.log(`  remove them again with:  node --experimental-strip-types scripts/testusers.ts --remove\n`);
}

async function remove(dry = false): Promise<void> {
  let profiles = 0;
  let usage = 0;
  let totals = 0;
  const targets: string[] = [];

  for (const handle of handles()) {
    const id = testUserId(handle);

    for (;;) {
      const page = await db().listDocuments(DB_ID, "usage_daily", [
        Query.equal("userId", id),
        Query.limit(100),
      ]);
      if (page.documents.length === 0) break;
      for (const doc of page.documents) {
        if (!dry) await db().deleteDocument(DB_ID, "usage_daily", (doc as { $id: string }).$id);
        usage++;
      }
      if (dry) break;
      if (page.documents.length < 100) break;
    }

    for (const [collection, counter] of [["user_totals", "t"], ["profiles", "p"]] as const) {
      try {
        // user_totals is keyed by its own row id, not the user id.
        const docId =
          collection === "profiles"
            ? id
            : (
                await db().listDocuments(DB_ID, "user_totals", [
                  Query.equal("userId", id),
                  Query.limit(1),
                ])
              ).documents[0]?.$id;
        if (!docId) continue;
        if (collection === "profiles") {
          const doc = (await db().getDocument(DB_ID, "profiles", id)) as unknown as {
            handle: string;
          };
          targets.push(`${doc.handle} (${id})`);
        }
        if (!dry) await db().deleteDocument(DB_ID, collection, docId as string);
        if (counter === "p") profiles++;
        else totals++;
      } catch {
        // Already gone.
      }
    }
  }

  if (dry) {
    console.log(`\n  would delete ${profiles} profiles, ${usage}+ usage rows, ${totals} totals`);
    console.log("  every one of them, by handle and id:");
    for (const t of targets) console.log(`    ${t}`);
    console.log();
    return;
  }
  console.log(`\n  removed: profiles ${profiles}, usage rows ${usage}, totals ${totals}\n`);
}

async function list(): Promise<void> {
  const found = await existing();
  console.log(`\n  ${found.size} of 50 test accounts present`);
  for (const handle of found.keys()) console.log(`    @${handle}`);
  console.log();
}

const dry = process.argv.includes("--dry-run");
const mode = process.argv.includes("--remove")
  ? () => remove(dry)
  : process.argv.includes("--list")
    ? list
    : add;

await mode();
