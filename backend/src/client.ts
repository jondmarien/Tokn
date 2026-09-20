import { Client, Databases, Query, ID } from "node-appwrite";
import { ENV } from "./env.ts";

/**
 * Appwrite client, shared per process.
 *
 * Next's dev server re-evaluates modules on every edit, so the client is cached
 * on globalThis rather than rebuilt per request.
 */

declare global {
  // eslint-disable-next-line no-var
  var __toknAppwrite: { client: Client; databases: Databases } | undefined;
}

function build() {
  const client = new Client()
    .setEndpoint(ENV.endpoint)
    .setProject(ENV.projectId)
    .setKey(ENV.apiKey);

  return { client, databases: new Databases(client) };
}

export function appwrite() {
  if (!globalThis.__toknAppwrite) globalThis.__toknAppwrite = build();
  return globalThis.__toknAppwrite;
}

export function db(): Databases {
  return appwrite().databases;
}

export const DB_ID = ENV.databaseId;

export { Query, ID };

/** Appwrite signals "no such row" with a 404; everything else is a real fault. */
export function isNotFound(error: unknown): boolean {
  const code = (error as { code?: number })?.code;
  return code === 404;
}

/** A unique-index violation, which we use to detect races rather than fail. */
export function isConflict(error: unknown): boolean {
  const code = (error as { code?: number })?.code;
  return code === 409;
}
