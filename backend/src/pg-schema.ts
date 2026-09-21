import { COLLECTIONS, type Attribute, type Collection, type Index } from "./schema.ts";

/**
 * The Postgres translation of the Appwrite schema.
 *
 * Generated from `COLLECTIONS` rather than written by hand, so the two cannot
 * drift while both exist. Run it with:
 *
 *   npm run schema:pg > schema.sql
 *
 * ## Choices worth knowing
 *
 * **Column names keep their exact camelCase spelling, quoted.** Renaming to
 * snake_case is the conventional thing and it is the wrong thing here: every
 * repo function reads `row.handleLower` and `row.costUsd` directly off the
 * document, so a rename turns a mechanical backend swap into an audit of every
 * field access in the codebase. Quoted identifiers cost one character each and
 * keep the migration boring.
 *
 * **`id` is text, not a uuid.** Appwrite document ids are already meaningful
 * here: `usageRowId` and `totalsRowId` derive them deterministically so a sync
 * can upsert without a lookup. Converting them to uuids would throw away the
 * one property that makes those writes idempotent.
 *
 * **Counters are `bigint`.** The Appwrite schema notes that a single user hit
 * 15.6 billion tokens in testing, which is why those attributes carry an
 * explicit ceiling at `Number.MAX_SAFE_INTEGER`. Postgres `integer` is 32-bit
 * and would overflow at 2.1 billion.
 *
 * **Enums become `text` with a check constraint** rather than native Postgres
 * enum types. A native enum needs `ALTER TYPE` to add a value and cannot be
 * changed inside a transaction in older versions; a check constraint is edited
 * like any other constraint and reads the same from the application.
 */

/** Appwrite's `$id`, and the two timestamps it maintains on every document. */
const SYSTEM_COLUMNS = `  "id"         text        primary key,
  "$createdAt" timestamptz not null default now(),
  "$updatedAt" timestamptz not null default now()`;

function columnType(attribute: Attribute): string {
  switch (attribute.type) {
    case "string":
      // Appwrite sizes are a storage hint, not a business rule, and Postgres
      // varchar(n) rejects overlong values outright where Appwrite truncated
      // or errored at the SDK. `text` keeps the data and leaves length limits
      // where they already are: in the validation code.
      return "text";
    case "integer":
      return "bigint";
    case "float":
      return "double precision";
    case "boolean":
      return "boolean";
    case "datetime":
      return "timestamptz";
    case "enum":
      return "text";
  }
}

function defaultClause(attribute: Attribute): string {
  if (!("default" in attribute) || attribute.default === undefined) return "";
  const value = attribute.default;
  if (typeof value === "string") return ` default '${value.replace(/'/g, "''")}'`;
  if (typeof value === "boolean") return ` default ${value}`;
  return ` default ${value}`;
}

function columnDefinition(attribute: Attribute): string {
  const parts = [`  "${attribute.key}"`, columnType(attribute)];
  if (attribute.required) parts.push("not null");
  const fallback = defaultClause(attribute);
  return parts.join(" ") + fallback;
}

/**
 * Range and enum rules, as table constraints.
 *
 * These exist in the Appwrite schema as attribute metadata that nothing
 * enforces on read. Postgres can actually hold the line, so the rules are
 * carried over rather than dropped — a negative token counter is a bug either
 * way, and it is cheaper to reject than to explain later.
 */
function checks(table: string, attributes: Attribute[]): string[] {
  const out: string[] = [];
  for (const attribute of attributes) {
    if (attribute.type === "enum") {
      const list = attribute.elements.map((e) => `'${e.replace(/'/g, "''")}'`).join(", ");
      out.push(
        `alter table "${table}" add constraint "${table}_${attribute.key}_check" ` +
          `check ("${attribute.key}" is null or "${attribute.key}" in (${list}));`,
      );
      continue;
    }
    if (attribute.type === "integer" || attribute.type === "float") {
      const bounds: string[] = [];
      if (attribute.min !== undefined) bounds.push(`"${attribute.key}" >= ${attribute.min}`);
      if (attribute.max !== undefined) bounds.push(`"${attribute.key}" <= ${attribute.max}`);
      if (bounds.length > 0) {
        out.push(
          `alter table "${table}" add constraint "${table}_${attribute.key}_range" ` +
            `check ("${attribute.key}" is null or (${bounds.join(" and ")}));`,
        );
      }
    }
  }
  return out;
}

function indexStatement(table: string, index: Index): string {
  const unique = index.type === "unique" ? "unique " : "";
  const columns = index.attributes
    .map((attribute, position) => {
      const order = index.orders?.[position];
      return `"${attribute}"${order === "DESC" ? " desc" : ""}`;
    })
    .join(", ");
  return `create ${unique}index if not exists "${table}_${index.key}" on "${table}" (${columns});`;
}

function table(collection: Collection): string {
  const lines: string[] = [];
  lines.push(`-- ${collection.name}: ${collection.purpose}`);
  lines.push(`create table if not exists "${collection.id}" (`);
  lines.push(SYSTEM_COLUMNS + (collection.attributes.length > 0 ? "," : ""));
  lines.push(collection.attributes.map(columnDefinition).join(",\n"));
  lines.push(");");
  lines.push("");
  for (const statement of checks(collection.id, collection.attributes)) lines.push(statement);
  for (const index of collection.indexes) lines.push(indexStatement(collection.id, index));
  return lines.join("\n");
}

export function emitPostgresSchema(): string {
  const header = [
    "-- tokn schema, generated from backend/src/schema.ts.",
    "-- Regenerate with: npm run schema:pg",
    "-- Do not edit by hand; edit the Appwrite schema and regenerate.",
    "",
    "begin;",
    "",
  ].join("\n");

  const body = COLLECTIONS.map(table).join("\n\n");

  /**
   * `$updatedAt` has to be maintained by the database.
   *
   * Appwrite sets it on every write. Nothing in the repo layer sets it
   * explicitly, so without this trigger the column would silently freeze at
   * insert time and any logic that reads it would quietly go wrong.
   */
  const trigger = [
    "",
    "",
    "-- Appwrite maintained $updatedAt itself; Postgres has to be told to.",
    "create or replace function touch_updated_at() returns trigger as $$",
    "begin",
    '  new."$updatedAt" = now();',
    "  return new;",
    "end;",
    "$$ language plpgsql;",
    "",
    ...COLLECTIONS.map(
      (collection) =>
        `create or replace trigger "${collection.id}_touch" before update on "${collection.id}"\n` +
        `  for each row execute function touch_updated_at();`,
    ),
    "",
    "commit;",
    "",
  ].join("\n");

  return header + body + trigger;
}

// Running this file prints the schema; importing it does not.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop() ?? "")) {
  process.stdout.write(emitPostgresSchema());
}
