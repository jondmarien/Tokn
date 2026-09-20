/**
 * Profile links.
 *
 * Stored as a JSON array of URLs on the user row. The provider is derived from
 * the host rather than stored, so a user only ever pastes a link and the right
 * icon and label appear. Anything unrecognised falls back to a globe and the
 * bare hostname, which keeps personal sites first-class.
 */

export type Provider = "github" | "x" | "linkedin" | "youtube" | "twitch" | "bluesky" | "web";

export interface ProfileLink {
  url: string;
  provider: Provider;
  /** What to show: a handle for known networks, a hostname otherwise. */
  label: string;
}

export const MAX_LINKS = 4;

const HOSTS: { match: RegExp; provider: Provider }[] = [
  { match: /(^|\.)github\.com$/i, provider: "github" },
  { match: /(^|\.)(x|twitter)\.com$/i, provider: "x" },
  { match: /(^|\.)linkedin\.com$/i, provider: "linkedin" },
  { match: /(^|\.)(youtube\.com|youtu\.be)$/i, provider: "youtube" },
  { match: /(^|\.)twitch\.tv$/i, provider: "twitch" },
  { match: /(^|\.)bsky\.app$/i, provider: "bluesky" },
];

/**
 * Accept what people actually paste: a bare host, a full URL, or an
 * `@handle`-looking path. Returns null for anything that is not a usable
 * http(s) link.
 */
export function normalizeLink(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > 300) return null;

  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }

  // Only the web. `javascript:` and friends must never reach an href.
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (!url.hostname.includes(".")) return null;

  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

export function describeLink(url: string): ProfileLink | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  const host = parsed.hostname.replace(/^www\./, "");
  const provider = HOSTS.find((entry) => entry.match.test(host))?.provider ?? "web";
  const segments = parsed.pathname.split("/").filter(Boolean);

  if (provider === "web" || segments.length === 0) {
    return { url, provider, label: host + (parsed.pathname === "/" ? "" : parsed.pathname) };
  }

  // Some networks bury the handle one level down: linkedin.com/in/<name>,
  // bsky.app/profile/<name>. Skip the routing segment when there is one.
  const skip = new Set(["in", "company", "profile", "c", "channel", "user"]);
  const handle = (skip.has(segments[0]!.toLowerCase()) && segments[1]) || segments[0]!;

  return { url, provider, label: handle.replace(/^@/, "") };
}

export function parseLinks(stored: string | null): ProfileLink[] {
  if (!stored) return [];

  let raw: unknown;
  try {
    raw = JSON.parse(stored);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];

  return raw
    .filter((value): value is string => typeof value === "string")
    .slice(0, MAX_LINKS)
    .map(describeLink)
    .filter((link): link is ProfileLink => link !== null);
}

/** Clean, de-duplicate and cap a set of submitted links for storage. */
export function serializeLinks(values: string[]): string | null {
  const seen = new Set<string>();
  const urls: string[] = [];

  for (const value of values) {
    const url = normalizeLink(value);
    if (!url) continue;
    const key = url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    urls.push(url);
    if (urls.length >= MAX_LINKS) break;
  }

  return urls.length > 0 ? JSON.stringify(urls) : null;
}
