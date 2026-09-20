/**
 * Re-export of the Appwrite-backed backend.
 *
 * Route handlers import from here rather than reaching into the package, so the
 * storage layer can be swapped without touching routes.
 *
 * Everything here runs server-side only — it holds the Appwrite API key, which
 * must never reach the browser. Do not import this from a client component.
 */
import "server-only";

export * from "../../src/index.ts";
