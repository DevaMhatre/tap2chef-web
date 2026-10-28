import { db, type StoredRecord, type SyncedTable } from "./db";
import { newId } from "../id";

// Until real login exists, this device gets its own tenant id. After login
// the records will be re-tagged with the account's tenant.
export async function getTenantId(): Promise<string> {
  const row = await db.meta.get("tenantId");
  if (row) return row.value;

  const tenantId = `local-${newId()}`;
  await db.meta.put({ key: "tenantId", value: tenantId });
  return tenantId;
}

type NewOrExisting = Partial<StoredRecord> & Record<string, unknown>;

// Create or update a record and queue it for sync, in one transaction so a
// saved record is never missing from the outbox.
export async function save(table: SyncedTable, data: NewOrExisting): Promise<StoredRecord> {
  const tenantId = data.tenantId ?? (await getTenantId());
  const now = Date.now();

  const record: StoredRecord = {
    ...data,
    id: data.id ?? newId(),
    tenantId,
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
