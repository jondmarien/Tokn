import "server-only";
import { unstable_cache } from "next/cache";

/**
 * What version of the CLI is currently published, and who is behind it.
 *
 * The CLI offers its own update from 0.1.3 onward, so for anyone on that or
 * later this page is a courtesy. The version that matters is everything
 * *older* than that: those copies have no way to tell their owner anything,
 * and without a notice here a machine can sit on a stale build indefinitely
 * while its owner has no reason to suspect it.
 */

/** The first release that can offer its own update. */
export const SELF_UPDATE_FROM = "0.1.3";

const REGISTRY = "https://registry.npmjs.org/toknhq/latest";

/**
 * Cached for six hours.
 *
 * This is an npm request rather than a database one, so it costs nothing
 * against the Appwrite budget, but a page that refetches on every render is
 * still a page that fails when npm is slow. Six hours is far finer than the
 * release cadence.
 */
export const latestCliVersion = unstable_cache(
  async (): Promise<string | null> => {
    try {
      const response = await fetch(REGISTRY, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(4000),
      });
      if (!response.ok) return null;
      const data = (await response.json()) as { version?: string };
      return typeof data.version === "string" ? data.version : null;
    } catch {
      // A registry that is down must not take the account page with it.
      return null;
    }
  },
  ["cli:latest-version"],
  { revalidate: 21_600 },
);

/**
 * Is `candidate` older than `than`?
 *
 * Same deliberately-small comparison the CLI uses. Anything unparseable
 * answers false, so a version string nobody anticipated is never reported as
 * out of date on the strength of a guess.
 */
export function isOlder(candidate: string, than: string): boolean {
  const parse = (v: string) =>
    v
      .trim()
      .split("-")[0]!
      .split(".")
      .map((part) => Number.parseInt(part, 10));

  const a = parse(candidate);
  const b = parse(than);
  if (a.some(Number.isNaN) || b.some(Number.isNaN)) return false;

  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const left = a[i] ?? 0;
    const right = b[i] ?? 0;
    if (left !== right) return left < right;
  }
  return false;
}

export interface OutdatedDevice {
  hostname: string;
  version: string;
  /** True when this copy is too old to offer its own update. */
  silent: boolean;
}

/**
 * Which of these machines are behind, and which cannot say so themselves.
 *
 * Devices with no recorded version are skipped rather than assumed stale: the
 * field was added after the first releases, so a null there means "we never
 * heard", not "old".
 */
export function outdatedDevices(
  devices: { hostname?: string | null; cli_version?: string | null }[],
  latest: string | null,
): OutdatedDevice[] {
  if (!latest) return [];

  const out: OutdatedDevice[] = [];
  for (const device of devices) {
    const version = device.cli_version?.trim();
    if (!version) continue;
    if (!isOlder(version, latest)) continue;
    out.push({
      hostname: device.hostname?.trim() || "this machine",
      version,
      silent: isOlder(version, SELF_UPDATE_FROM),
    });
  }
  return out;
}
