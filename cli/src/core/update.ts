import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import os from "node:os";
import path from "node:path";
import { VERSION } from "../version.js";
import { loadConfig, saveConfig, type Config } from "./config.js";

/**
 * Keeping the CLI current.
 *
 * ## The shape of the risk
 *
 * This is code that downloads code and installs it over itself. That deserves
 * more care than a feature of its size normally would, so four rules hold
 * throughout and none of them is negotiable:
 *
 * 1. **It never updates without being asked.** The check is passive, the offer
 *    is a prompt, and silence means no.
 * 2. **It verifies what it downloaded.** The registry publishes a sha512 for
 *    every tarball; a file whose digest does not match is deleted unread. A
 *    self-updater without an integrity check is a remote code execution
 *    waiting for one bad hop.
 * 3. **It refuses when it is not sure.** A dev checkout linked with `npm link`
 *    and a copy installed some other way both decline politely instead of
 *    guessing and destroying somebody's working tree.
 * 4. **It never breaks the command the user actually ran.** Every failure here
 *    is swallowed. A registry outage must not stop a scan.
 *
 * ## Why npm still does the install
 *
 * The tarball is fetched here, for a real byte-level progress bar and to check
 * the digest, but `npm install -g` performs the install. npm owns the global
 * tree: its bin links, its lockfiles, its permissions. Reimplementing that to
 * save one subprocess would be trading a well-tested path for a homemade one.
 */

const REGISTRY = "https://registry.npmjs.org";
const PACKAGE = "toknhq";

/** The passive check is on the critical path of a command, so it is brief. */
const CHECK_TIMEOUT_MS = 3_000;
/** The download is not: someone asked for it and is watching a bar. */
const DOWNLOAD_TIMEOUT_MS = 60_000;

/** Once a day. A CLI that phones home on every invocation is a nuisance. */
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** What the notice needs: which version, and what you are on. */
export interface UpdateInfo {
  current: string;
  latest: string;
}

/** What the installer needs, fetched only once somebody has said yes. */
export interface ReleaseArtifact {
  version: string;
  tarball: string;
  integrity: string;
}

/* ------------------------------------------------------------- versions */

/**
 * Compare two dotted versions.
 *
 * Deliberately small rather than semver-complete: this package's versions are
 * plain `major.minor.patch`, and a prerelease tag sorts as "not newer", which
 * is the safe direction. Pulling in a semver dependency for this would be the
 * only dependency in the package.
 */
export function isNewer(candidate: string, current: string): boolean {
  const parse = (v: string) =>
    v
      .split("-")[0]! // drop any prerelease tag
      .split(".")
      .map((part) => Number.parseInt(part, 10));

  const a = parse(candidate);
  const b = parse(current);
  if (a.some(Number.isNaN) || b.some(Number.isNaN)) return false;

  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const left = a[i] ?? 0;
    const right = b[i] ?? 0;
    if (left !== right) return left > right;
  }
  return false;
}

/* --------------------------------------------------------- install kind */

export type InstallKind = "npm-global" | "linked" | "unknown";

/**
 * How this copy got here, and therefore whether it can safely replace itself.
 *
 * A real global install lives at `<prefix>/lib/node_modules/toknhq/...`, so its
 * *resolved* path contains that directory. `npm link` puts a symlink there
 * pointing at a source checkout, so resolving the real path lands outside
 * `node_modules` entirely — which is exactly the case that must never be
 * overwritten, because doing so would replace somebody's working tree with a
 * published tarball.
 */
export function installKind(): InstallKind {
  let real: string;
  try {
    real = realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return "unknown";
  }

  const marker = `${path.sep}node_modules${path.sep}${PACKAGE}${path.sep}`;
  if (real.includes(marker)) return "npm-global";

  // Resolved outside node_modules: either `npm link` or run straight from a
  // checkout. Both are development, and both are left alone.
  return "linked";
}

/* ------------------------------------------------------------- checking */

interface RegistryVersion {
  version?: string;
  dist?: { tarball?: string; integrity?: string; shasum?: string };
}

async function fetchJson(url: string, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: { accept: "application/json", "user-agent": `tokn/${VERSION}` },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Ask the registry what the newest published version is.
 *
 * Returns null for every failure, including a malformed answer. Nothing about
 * a version check is worth interrupting somebody's work over.
 */
export async function fetchLatestVersion(
  timeoutMs = CHECK_TIMEOUT_MS,
): Promise<string | null> {
  const release = await fetchRelease(timeoutMs);
  return release?.version ?? null;
}

export async function fetchRelease(
  timeoutMs = CHECK_TIMEOUT_MS,
): Promise<ReleaseArtifact | null> {
  try {
    const data = (await fetchJson(`${REGISTRY}/${PACKAGE}/latest`, timeoutMs)) as RegistryVersion;
    const latest = data?.version;
    const tarball = data?.dist?.tarball;
    const integrity = data?.dist?.integrity;
    if (!latest || !tarball || !integrity) return null;
    // The tarball URL comes from the registry, but it is still a URL this
    // process is about to download and install, so it has to be on the
    // registry's own host over TLS.
    if (!tarball.startsWith(`${REGISTRY}/`)) return null;
    return { version: latest, tarball, integrity };
  } catch {
    return null;
  }
}

export interface UpdateState {
  /** When the registry was last asked, so it is asked at most daily. */
  checkedAt?: string;
  latest?: string;
  /** A version the user said no to. Not offered again. */
  declined?: string;
}

/**
 * The cached answer to "is there something newer", refreshed at most daily.
 *
 * Writes the result back to the config so the next command can answer without
 * a network call at all. Returns null when there is nothing to say, which is
 * the overwhelmingly common case.
 */
export async function checkForUpdate(
  config: Config,
  options: { force?: boolean } = {},
): Promise<UpdateInfo | null> {
  if (process.env.TOKN_NO_UPDATE_CHECK) return null;

  const state = config.update ?? {};
  const age = state.checkedAt ? Date.now() - Date.parse(state.checkedAt) : Infinity;
  const stale = !Number.isFinite(age) || age > CHECK_INTERVAL_MS;

  if (!options.force && !stale) {
    // Straight from the config, no network at all. The notice only needs a
    // version number; the tarball is fetched when somebody actually accepts.
    // An earlier draft re-fetched here, which meant every command paid for a
    // registry round trip for as long as an update was outstanding — the exact
    // cost the daily interval exists to avoid.
    const cached = state.latest;
    if (cached && isNewer(cached, VERSION) && state.declined !== cached) {
      return { current: VERSION, latest: cached };
    }
    return null;
  }

  const latest = await fetchLatestVersion();
  const next: UpdateState = {
    ...state,
    checkedAt: new Date().toISOString(),
    ...(latest ? { latest } : {}),
  };

  try {
    await saveConfig({ ...config, update: next });
  } catch {
    // An unwritable config should not stop a command; the check just repeats.
  }

  if (!latest || !isNewer(latest, VERSION)) return null;
  if (next.declined === latest) return null;
  return { current: VERSION, latest };
}

/** Remember that this version was turned down, so it is not offered again. */
export async function declineUpdate(version: string): Promise<void> {
  try {
    const config = await loadConfig();
    await saveConfig({
      ...config,
      update: { ...(config.update ?? {}), declined: version },
    });
  } catch {
    // Worst case the offer appears again tomorrow.
  }
}

/* ----------------------------------------------------------- installing */

export type UpdatePhase = "downloading" | "verifying" | "installing";

export interface UpdateProgress {
  phase: UpdatePhase;
  /** 0..1 during download, once the total size is known. */
  fraction?: number;
  received?: number;
  total?: number;
}

export class UpdateError extends Error {
  constructor(
    message: string,
    readonly hint?: string,
  ) {
    super(message);
    this.name = "UpdateError";
  }
}

/**
 * Download, verify, install.
 *
 * The digest check is the point of doing the download here rather than letting
 * npm fetch it: a tarball whose sha512 does not match what the registry
 * published never reaches the disk path npm is pointed at.
 */
export async function performUpdate(
  release: ReleaseArtifact,
  onProgress: (progress: UpdateProgress) => void,
): Promise<void> {
  const kind = installKind();
  if (kind !== "npm-global") {
    throw new UpdateError(
      "this copy of tokn is not a global npm install",
      kind === "linked"
        ? "It looks like a development checkout (npm link). Update it with git instead."
        : "Reinstall with npm install -g toknhq.",
    );
  }

  const dir = await mkdtemp(path.join(os.tmpdir(), "tokn-update-"));
  const file = path.join(dir, `${PACKAGE}-${release.version}.tgz`);

  try {
    onProgress({ phase: "downloading", fraction: 0 });
    const bytes = await download(release.tarball, (received, total) => {
      onProgress({
        phase: "downloading",
        received,
        total,
        fraction: total > 0 ? received / total : undefined,
      });
    });

    onProgress({ phase: "verifying", fraction: 1 });
    verifyIntegrity(bytes, release.integrity);

    await writeFile(file, bytes, { mode: 0o600 });

    onProgress({ phase: "installing", fraction: 1 });
    await npmInstall(file);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

async function download(
  url: string,
  onChunk: (received: number, total: number) => void,
): Promise<Buffer> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: { "user-agent": `tokn/${VERSION}` },
      signal: controller.signal,
    });
    if (!response.ok || !response.body) {
      throw new UpdateError(`could not download the update (HTTP ${response.status})`);
    }

    const total = Number(response.headers.get("content-length") ?? 0);
    const chunks: Buffer[] = [];
    let received = 0;

    for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
      const buffer = Buffer.from(chunk);
      chunks.push(buffer);
      received += buffer.length;
      onChunk(received, total);
    }

    return Buffer.concat(chunks);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Check the download against the digest the registry published.
 *
 * npm's `integrity` is `<algorithm>-<base64>`; only sha512 is accepted here.
 * Trusting a weaker algorithm because the registry offered one would defeat
 * the check, and every current publish carries sha512.
 */
function verifyIntegrity(bytes: Buffer, integrity: string): void {
  const [algorithm, expected] = integrity.split("-", 2);
  if (algorithm !== "sha512" || !expected) {
    throw new UpdateError("the registry did not publish a sha512 for this release");
  }

  const actual = createHash("sha512").update(bytes).digest("base64");
  if (actual !== expected) {
    throw new UpdateError(
      "the downloaded update did not match its published checksum",
      "Nothing was installed. This can mean a corrupted download, or something between you and the registry.",
    );
  }
}

function npmInstall(tarball: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // `npm` rather than an absolute path: the right npm is the one on PATH,
    // which is the one that owns the global tree this was installed into.
    const command = process.platform === "win32" ? "npm.cmd" : "npm";
    const child = spawn(command, ["install", "--global", "--no-fund", "--no-audit", tarball], {
      stdio: ["ignore", "ignore", "pipe"],
    });

    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("error", () =>
      reject(new UpdateError("could not run npm", "Is npm on your PATH?")),
    );

    child.on("close", (code) => {
      if (code === 0) return resolve();
      // EACCES is the common one and has a specific, useful answer.
      const denied = /EACCES|permission denied/i.test(stderr);
      reject(
        new UpdateError(
          `npm exited with code ${code}`,
          denied
            ? "The global install directory is not writable. Re-run with sudo, or use a node version manager."
            : stderr.trim().split("\n").slice(-2).join(" ").slice(0, 200) || undefined,
        ),
      );
    });
  });
}
