/**
 * Read-only SQLite access via Node's built-in `node:sqlite`.
 *
 * Several tools (GitHub Copilot CLI, opencode, Cursor) keep their history in
 * SQLite. Using the built-in module keeps tokn at zero runtime dependencies —
 * no native build step on install — at the cost of requiring Node 22.5+.
 * Anything older simply reports those sources as unavailable rather than
 * failing the whole scan.
 */

export interface ReadOnlyDb {
  all(sql: string): Record<string, unknown>[];
  close(): void;
}

let cachedModule: { DatabaseSync: new (path: string, opts?: unknown) => unknown } | null = null;
let moduleChecked = false;

function loadSqlite(): typeof cachedModule {
  if (moduleChecked) return cachedModule;
  moduleChecked = true;

  // `process.getBuiltinModule` (Node 22.3+) loads a builtin synchronously from
  // ESM. A static import is not an option: on Node versions without
  // `node:sqlite` it would fail at module load and take the whole CLI down,
  // and a bare `require` does not exist in an ES module at all.
  try {
    const get = (process as NodeJS.Process & {
      getBuiltinModule?: (id: string) => unknown;
    }).getBuiltinModule;

    if (typeof get === "function") {
      cachedModule = (get("node:sqlite") as typeof cachedModule) ?? null;
    }
  } catch {
    cachedModule = null;
  }

  return cachedModule;
}

export function sqliteAvailable(): boolean {
  return loadSqlite() !== null;
}

export const SQLITE_REQUIREMENT = "needs Node 22.5 or newer for built-in SQLite";

/**
 * Open a database read-only. Returns null when SQLite is unavailable or the
 * file cannot be opened — a locked or corrupt history file must never break a
 * scan of the other tools.
 */
export function openReadOnly(path: string): ReadOnlyDb | null {
  const mod = loadSqlite();
  if (!mod) return null;

  try {
    const db = new mod.DatabaseSync(path, { readOnly: true }) as {
      prepare(sql: string): { all(): unknown[] };
      close(): void;
    };

    return {
      all(sql: string) {
        return db.prepare(sql).all() as Record<string, unknown>[];
      },
      close() {
        try {
          db.close();
        } catch {
          // Already closed.
        }
      },
    };
  } catch {
    return null;
  }
}

/** Does this database have a table by that name? */
export function hasTable(db: ReadOnlyDb, table: string): boolean {
  try {
    const rows = db.all(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='${table.replace(/'/g, "''")}'`,
    );
    return rows.length > 0;
  } catch {
    return false;
  }
}
