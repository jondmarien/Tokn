import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ModelPrice } from "./pricing.js";

/**
 * On-disk state: the link token, who it belongs to, and a cached pricing table.
 *
 * The file holds a credential, so it is written with mode 0600 inside a 0700
 * directory — the same posture `gh` uses for its hosts file.
 */

/**
 * Where the CLI talks to.
 *
 * `PRODUCTION_HOST` is the real origin. `DEFAULT_HOST` is what a fresh install
 * actually uses, and it stays local until the site is deployed there — pointing
 * it at a domain that resolves to nothing would break every new install for the
 * sake of being early.
 *
 * Deploy day is one line: make DEFAULT_HOST equal PRODUCTION_HOST and ship a
 * version. Anyone already linked keeps the host stored in their config until
 * they re-link, and `TOKN_HOST` overrides both.
 */
export const PRODUCTION_HOST = "https://toknhq.com";
export const DEFAULT_HOST = "http://localhost:3000";

export interface Config {
  host: string;
  token?: string;
  user?: { id: string; handle: string; name?: string };
  linkedAt?: string;
  lastSyncAt?: string;
  lastSyncRows?: number;
  pricing?: { fetchedAt: string; models: Record<string, ModelPrice> };
  /** Background publishing driven by a Claude Code session hook. */
  autosync?: { enabled?: boolean; intervalMinutes?: number };
}

export function configDir(): string {
  return process.env.TOKN_CONFIG_DIR ?? path.join(os.homedir(), ".tokn");
}

export function configPath(): string {
  return path.join(configDir(), "config.json");
}

const DEFAULTS: Config = { host: DEFAULT_HOST };

export async function loadConfig(): Promise<Config> {
  try {
    const raw = await fs.readFile(configPath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<Config>;
    return { ...DEFAULTS, ...parsed, host: resolveHost(parsed.host) };
  } catch {
    // Missing or corrupt: start from defaults rather than failing the command.
    return { ...DEFAULTS, host: resolveHost(undefined) };
  }
}

/** Env var wins over the stored host so CI and local dev can retarget easily. */
function resolveHost(stored: string | undefined): string {
  return process.env.TOKN_HOST ?? stored ?? DEFAULT_HOST;
}

export async function saveConfig(config: Config): Promise<void> {
  const dir = configDir();
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  const body = JSON.stringify(config, null, 2) + "\n";
  await fs.writeFile(configPath(), body, { mode: 0o600 });
  // mkdir/writeFile only apply the mode on creation; enforce it every time in
  // case the file predates this logic or was copied in with looser bits.
  await fs.chmod(configPath(), 0o600).catch(() => {});
}

export async function clearConfig(): Promise<void> {
  const config = await loadConfig();
  await saveConfig({ host: config.host });
}

/** A token supplied by the environment overrides the stored one (for CI). */
export function resolveToken(config: Config): string | undefined {
  return process.env.TOKN_TOKEN ?? config.token;
}

export function isLinked(config: Config): boolean {
  return Boolean(resolveToken(config));
}
