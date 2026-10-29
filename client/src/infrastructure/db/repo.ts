import { db, isShopTable, type StoredRecord, type SyncedTable } from "./db";
import { newId } from "../id";

/** The account this device belongs to and the shop it works in. */
export type Scope = { accountId: string; shopId: string };

// Made on the device the first time anything is stored, before any sign-in;
// the server adopts these ids at sign-up, so no record is ever re-tagged.
// Domain and use cases never see them: storage stamps every write.
export async function getScope(): Promise<Scope> {
  return db.transaction("rw", db.meta, async () => {
    const [account, shop] = await db.meta.bulkGet(["accountId", "shopId"]);
    const scope = { accountId: account?.value ?? newId(), shopId: shop?.value ?? newId() };
    if (!account || !shop) {
      await db.meta.bulkPut([{ key: "accountId", value: scope.accountId }, { key: "shopId", value: scope.shopId }]);
    }
    return scope;
  });
}

type NewOrExisting = Partial<StoredRecord> & Record<string, unknown>;

// Create or update a record and queue it for sync, in one transaction so a
// saved record is never missing from the outbox.
export async function save(table: SyncedTable, data: NewOrExisting, scope?: Scope): Promise<StoredRecord> {
  const { accountId, shopId } = scope ?? (await getScope());
  const now = Date.now();

  const record: StoredRecord = {
    ...data,
    id: data.id ?? newId(),
    accountId,
    ...(isShopTable(table) ? { shopId } : {}),
    createdAt: data.createdAt ?? now,
    updatedAt: now,
    deleted: data.deleted ?? false,
  };

  await db.transaction("rw", db[table], db.outbox, async () => {
    await db[table].put(record);
    await db.outbox.add({ table, recordId: record.id, queuedAt: now });
  });

  return record;
}

// Soft delete so the deletion reaches the server and other devices.
export function remove(table: SyncedTable, record: StoredRecord): Promise<StoredRecord> {
  return save(table, { ...record, deleted: true });
}

export type RecordWrite = { table: SyncedTable; record: { id: string }; op: "put" | "remove" };

/**
 * Writes a batch atomically: every record and its outbox entry, or nothing.
 * A record replaces the stored row whole; only createdAt survives from it. A
 * merge would keep a field the new record no longer has (an undone removal
 * would stay removed).
 */
export async function writeAll(writes: readonly RecordWrite[]): Promise<void> {
  // Read outside the transaction: `meta` is not one of its tables.
  const scope = await getScope();
  const tables = [...new Set(writes.map((w) => db[w.table]))];

  await db.transaction("rw", [...tables, db.outbox], async () => {
    for (const { table, record, op } of writes) {
      const existing = await db[table].get(record.id);
      await save(table, { createdAt: existing?.createdAt, ...record, deleted: op === "remove" }, scope);
    }
  });
}
