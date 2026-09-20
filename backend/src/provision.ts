import { Databases, IndexType } from "node-appwrite";
import { db, DB_ID, isNotFound, isConflict } from "./client.ts";
import { COLLECTIONS, type Attribute, type Collection, type Index } from "./schema.ts";
import { ENV } from "./env.ts";

/**
 * Create the tokn database, its collections, attributes and indexes.
 *
 * Idempotent by design: every step checks first and skips what already exists,
 * so this runs on a fresh project and against a live one alike. It never drops
 * or alters an existing attribute — schema changes that need that are a
 * deliberate migration, not a side effect of a deploy.
 *
 *   npm run provision
 */

const log = (symbol: string, message: string) => console.log(`  ${symbol} ${message}`);

/**
 * Appwrite builds attributes and indexes asynchronously; a freshly created one
 * is `processing` for a moment and an index over it fails until it is
 * `available`. Poll rather than sleep a fixed amount.
 */
async function waitForAttribute(
  databases: Databases,
  collectionId: string,
  key: string,
  timeoutMs = 30_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const attribute = (await databases.getAttribute(DB_ID, collectionId, key)) as {
        status?: string;
      };
      if (attribute.status === "available") return;
      if (attribute.status === "failed") {
        throw new Error(`attribute ${collectionId}.${key} failed to build`);
      }
    } catch (error) {
      if (!isNotFound(error)) throw error;
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`timed out waiting for ${collectionId}.${key}`);
}

async function ensureDatabase(databases: Databases): Promise<void> {
  try {
    await databases.get(DB_ID);
    log("·", `database ${DB_ID} already exists`);
  } catch (error) {
    if (!isNotFound(error)) throw error;
    await databases.create(DB_ID, "tokn");
    log("+", `created database ${DB_ID}`);
  }
}

async function ensureCollection(databases: Databases, collection: Collection): Promise<void> {
  try {
    await databases.getCollection(DB_ID, collection.id);
    log("·", `collection ${collection.id}`);
  } catch (error) {
    if (!isNotFound(error)) throw error;
    await databases.createCollection(
      DB_ID,
      collection.id,
      collection.name,
      // No row-level permissions: every read and write goes through our own
      // API routes with the server key, which apply their own authorisation.
      // Granting client access here would let anyone with the public project
      // id read every user's raw usage.
      undefined,
      false,
    );
    log("+", `created collection ${collection.id}`);
  }
}

async function ensureAttribute(
  databases: Databases,
  collectionId: string,
  attribute: Attribute,
): Promise<boolean> {
  try {
    await databases.getAttribute(DB_ID, collectionId, attribute.key);
    return false; // Already present — never mutated here.
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }

  const required = attribute.required ?? false;
  // Appwrite rejects a default on a required attribute.
  const fallback = <T>(value: T | undefined): T | undefined => (required ? undefined : value);

  switch (attribute.type) {
    case "string":
      await databases.createStringAttribute(
        DB_ID,
        collectionId,
        attribute.key,
        attribute.size,
        required,
        fallback(attribute.default),
        attribute.array ?? false,
      );
      break;
    case "integer":
      await databases.createIntegerAttribute(
        DB_ID,
        collectionId,
        attribute.key,
        required,
        attribute.min,
        attribute.max,
        fallback(attribute.default),
      );
      break;
    case "float":
      await databases.createFloatAttribute(
        DB_ID,
        collectionId,
        attribute.key,
        required,
        attribute.min,
        attribute.max,
        fallback(attribute.default),
      );
      break;
    case "boolean":
      await databases.createBooleanAttribute(
        DB_ID,
        collectionId,
        attribute.key,
        required,
        fallback(attribute.default),
      );
      break;
    case "datetime":
      await databases.createDatetimeAttribute(DB_ID, collectionId, attribute.key, required);
      break;
    case "enum":
      await databases.createEnumAttribute(
        DB_ID,
        collectionId,
        attribute.key,
        attribute.elements,
        required,
        fallback(attribute.default),
      );
      break;
  }

  await waitForAttribute(databases, collectionId, attribute.key);
  log("+", `  ${collectionId}.${attribute.key} (${attribute.type})`);
  return true;
}

async function ensureIndex(
  databases: Databases,
  collectionId: string,
  index: Index,
): Promise<void> {
  try {
    await databases.getIndex(DB_ID, collectionId, index.key);
    return;
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }

  try {
    await databases.createIndex(
      DB_ID,
      collectionId,
      index.key,
      index.type === "unique" ? IndexType.Unique : IndexType.Key,
      index.attributes,
      index.orders,
    );
    log("+", `  ${collectionId} index ${index.key} (${index.type})`);
  } catch (error) {
    // A concurrent provision may have created it between our check and now.
    if (!isConflict(error)) throw error;
  }
}

async function main(): Promise<void> {
  const databases = db();

  console.log(`\n  tokn schema -> ${ENV.endpoint}`);
  console.log(`  project ${ENV.projectId}, database ${DB_ID}\n`);

  await ensureDatabase(databases);

  for (const collection of COLLECTIONS) {
    await ensureCollection(databases, collection);

    for (const attribute of collection.attributes) {
      await ensureAttribute(databases, collection.id, attribute);
    }

    // Indexes come after every attribute is available, or they fail to build.
    for (const index of collection.indexes) {
      await ensureIndex(databases, collection.id, index);
    }
  }

  console.log(`\n  Done. ${COLLECTIONS.length} collections ready in "${DB_ID}".\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\n  provisioning failed: ${message}\n`);
  process.exitCode = 1;
});
