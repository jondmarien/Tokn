/**
 * The Appwrite-backed backend, re-exported for the app.
 *
 * Routes and server components import from here rather than reaching into the
 * package, so the storage layer can be swapped without touching them.
 *
 * Server-only: this module holds the Appwrite API key, which must never reach
 * the browser. Importing it from a client component is a build error.
 */
import "server-only";

export * from "../../../backend/src/index.ts";
