/**
 * The SQLite layer is gone — storage is Appwrite now.
 *
 * This file stays only to give a clear error if something still imports it.
 * Use `@/lib/backend` for data access and `@/lib/auth` for accounts, sessions
 * and devices; both expose the same names the SQLite layer did, but async.
 */

export function getDb(): never {
  throw new Error(
    "getDb() is gone: storage moved to Appwrite. Import from '@/lib/backend' or '@/lib/auth' instead.",
  );
}
