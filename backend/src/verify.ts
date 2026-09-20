import { db, DB_ID, Query } from "./client.ts";
import { createProfile, findProfileByHandle, authenticate } from "./repo/profiles.ts";
import { issueLinkCode, redeemLinkCode, authenticateDevice, listDevices } from "./repo/devices.ts";
import { createSession, resolveSession, deleteSession } from "./repo/sessions.ts";
import { listUsage, summarize } from "./repo/usage.ts";
import { leaderboard, rankOf, getTotals } from "./repo/leaderboard.ts";
import { pricingTable } from "./repo/pricing.ts";
import { cliLink, cliMe, cliSync } from "./service.ts";
import { usageRowId } from "./ids.ts";

/**
 * End-to-end check against the live Appwrite project.
 *
 * Creates a throwaway account, walks the full CLI flow, asserts the invariants
 * that actually matter, then deletes everything it made.
 *
 *   npm run verify
 */

let failures = 0;

function check(label: string, condition: boolean, detail = ""): void {
  if (condition) {
    console.log(`  ok    ${label}${detail ? ` ${detail}` : ""}`);
  } else {
    failures++;
    console.log(`  FAIL  ${label}${detail ? ` ${detail}` : ""}`);
  }
}

const TEST_HANDLE = `verify_${Date.now().toString(36)}`;

async function main(): Promise<void> {
  console.log(`\n  verifying tokn backend against ${DB_ID}\n`);

  /* ---------------------------------------------------------- accounts */

  const profile = await createProfile({
    handle: TEST_HANDLE,
    password: "correct horse battery staple",
    name: "Verify Bot",
  });
  check("profile created", Boolean(profile.$id));

  const found = await findProfileByHandle(TEST_HANDLE.toUpperCase());
  check("handle lookup is case-insensitive", found?.$id === profile.$id);

  check(
    "password verifies",
    (await authenticate(TEST_HANDLE, "correct horse battery staple"))?.$id === profile.$id,
  );
  check("wrong password rejected", (await authenticate(TEST_HANDLE, "nope")) === null);

  /* ---------------------------------------------------------- sessions */

  const session = await createSession(profile.$id);
  check("session resolves", (await resolveSession(session.id))?.$id === profile.$id);
  await deleteSession(session.id);
  check("session revoked", (await resolveSession(session.id)) === null);

  /* -------------------------------------------------------- CLI linking */

  const issued = await issueLinkCode(profile.$id);
  check("link code issued", /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(issued.code), issued.code);

  // The CLI normalises to upper case with a dash; accept a sloppy paste.
  const sloppy = issued.code.toLowerCase().replace("-", "");
  const linked = await cliLink({ code: sloppy, device: { hostname: "verify", platform: "darwin", cliVersion: "0.1.0" } });
  check("code redeems (lowercase, no dash)", "token" in linked);
  if (!("token" in linked)) throw new Error("cannot continue without a token");

  const authHeader = `Bearer ${linked.token}`;
  check("device authenticates", (await authenticateDevice(authHeader)) !== null);
  check("bad token rejected", (await authenticateDevice("Bearer tokn_wrong")) === null);

  const reuse = await cliLink({ code: issued.code });
  check("code is single-use", "error" in reuse, "error" in reuse ? `(${reuse.error})` : "");

  const me = await cliMe(authHeader);
  check("GET /api/cli/me", "user" in me && me.user.handle === TEST_HANDLE);

  /* ------------------------------------------------- sync and the upsert */

  const rows = [
    { day: "2026-09-17", tool: "claude-code", model: "claude-opus-5", fast: false,
      requests: 10, input: 100, output: 200, cacheWrite5m: 0, cacheWrite1h: 5000, cacheRead: 9000, costUsd: 12.5 },
    { day: "2026-09-17", tool: "copilot-cli", model: "claude-opus-5", fast: false,
      requests: 3, input: 50, output: 20, cacheWrite5m: 10, cacheWrite1h: 0, cacheRead: 5, costUsd: 0.4 },
    { day: "2026-09-18", tool: "claude-code", model: "claude-sonnet-5", fast: false,
      requests: 7, input: 70, output: 30, cacheWrite5m: 1, cacheWrite1h: 0, cacheRead: 2, costUsd: 1.25 },
    // Malformed: must be skipped, not fail the sync.
    { day: "not-a-day", tool: "x", model: "y", requests: 1 },
  ];

  const first = await cliSync(authHeader, { rows, cliVersion: "0.1.0" });
  check("sync accepted", "accepted" in first && first.accepted === 3, "accepted" in first ? `(${first.accepted} rows)` : "");
  check("malformed row skipped", "skipped" in first && first.skipped === 1);

  const afterFirst = summarize(await listUsage(profile.$id));
  check("cost stored", Math.abs(afterFirst.costUsd - 14.15) < 0.001, `$${afterFirst.costUsd}`);

  // The invariant everything rests on: re-uploading the same history must
  // replace rows, not add to them.
  await cliSync(authHeader, { rows, cliVersion: "0.1.0" });
  await cliSync(authHeader, { rows, cliVersion: "0.1.0" });
  const afterThird = summarize(await listUsage(profile.$id));
  check(
    "RE-SYNC IS IDEMPOTENT (no double counting)",
    Math.abs(afterThird.costUsd - afterFirst.costUsd) < 0.000001 &&
      afterThird.requests === afterFirst.requests,
    `$${afterThird.costUsd} after 3 syncs`,
  );

  // The tool dimension is what keeps two tools' rows for the same model+day
  // from colliding.
  check(
    "same model+day across two tools kept separate",
    (await listUsage(profile.$id)).filter((r) => r.day === "2026-09-17").length === 2,
  );
  check(
    "row ids are deterministic",
    usageRowId(profile.$id, "2026-09-17", "claude-code", "claude-opus-5", false) ===
      usageRowId(profile.$id, "2026-09-17", "claude-code", "claude-opus-5", false),
  );

  /* ------------------------------------------------------- rollup + board */

  const totals = await getTotals(profile.$id);
  check("totals rolled up", Math.abs((totals?.costUsd ?? 0) - 14.15) < 0.001, `$${totals?.costUsd}`);
  check("tool count recorded", totals?.toolCount === 2, `${totals?.toolCount} tools`);
  check("active days", totals?.activeDays === 2);

  const rank = await rankOf(profile.$id);
  check("rank computed", typeof rank === "number" && rank >= 1, `#${rank}`);

  const board = await leaderboard({ limit: 5 });
  check("leaderboard returns rows", board.length >= 1, `${board.length} entries`);
  check("leaderboard sorted by cost", board.every((e, i) => i === 0 || board[i - 1]!.value >= e.value));

  /* ------------------------------------------------------------- pricing */

  const prices = await pricingTable();
  const opus = prices["claude-opus-5"];
  check("pricing table served", Object.keys(prices).length > 500, `${Object.keys(prices).length} models`);
  check("opus-5 priced", opus?.input === 5 && opus?.output === 25);
  check("1h cache tier present", opus?.cacheWrite1h === 10, `${opus?.cacheWrite1h}`);
  check("fast mode present", opus?.fast?.input === 10);

  /* ------------------------------------------------------------- cleanup */

  const devices = await listDevices(profile.$id);
  for (const device of devices) {
    await db().deleteDocument(DB_ID, "devices", device.$id).catch(() => {});
  }
  for (const row of await listUsage(profile.$id)) {
    await db().deleteDocument(DB_ID, "usage_daily", row.$id).catch(() => {});
  }
  for (const c of (await db().listDocuments(DB_ID, "link_codes", [Query.equal("userId", profile.$id)])).documents) {
    await db().deleteDocument(DB_ID, "link_codes", c.$id).catch(() => {});
  }
  await db().deleteDocument(DB_ID, "user_totals", profile.$id).catch(() => {});
  await db().deleteDocument(DB_ID, "profiles", profile.$id).catch(() => {});
  check("test data removed", (await findProfileByHandle(TEST_HANDLE)) === null);

  console.log(
    failures === 0
      ? `\n  All checks passed.\n`
      : `\n  ${failures} check(s) FAILED.\n`,
  );
  if (failures > 0) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(`\n  verify crashed: ${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
