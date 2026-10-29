import { isShopTable, SYNCED_TABLES, type StoredRecord, type SyncedTable } from "../db/db";
import type { Scope } from "../db/repo";

// The anti-corruption layer between stored rows and the server's sync format.
// The server files a record under the device's token, never under what the
// record says, so the account never travels; the shop does, on shop records.

export type WireRecord = { id: string; shopId?: string; deleted: boolean; [field: string]: unknown };
export type WireChange = { table: SyncedTable; record: WireRecord };
export type PulledChange = WireChange & { seq: number };

/**
 * A stored row as the server should get it. A shop record goes under the shop
 * this device works in: a tab still on an older build, or a write landing as
 * the device signed in, may have left an old shop id or none.
 */
export function toWire(table: SyncedTable, row: StoredRecord, scope: Scope): WireChange {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { accountId, shopId, tenantId, ...fields } = row;
  return {
    table,
    record: { ...fields, id: row.id, deleted: row.deleted === true, ...(isShopTable(table) ? { shopId: scope.shopId } : {}) },
  };
}

/** A pulled record as a stored row, or undefined if it isn't one we know how to keep. */
export function fromWire(change: unknown, scope: Scope): { table: SyncedTable; row: StoredRecord; seq: number } | undefined {
  if (typeof change !== "object" || change === null) return undefined;
  const { table, record, seq } = change as Record<string, unknown>;
  if (!SYNCED_TABLES.includes(table as SyncedTable) || typeof seq !== "number") return undefined;
  if (typeof record !== "object" || record === null || typeof (record as WireRecord).id !== "string") return undefined;
  const wire = record as WireRecord;
  const row: StoredRecord = {
    createdAt: 0,
    updatedAt: 0,
    ...wire,
    accountId: scope.accountId,
    deleted: wire.deleted === true,
  };
  if (!isShopTable(table as SyncedTable)) delete row.shopId;
  return { table: table as SyncedTable, row, seq };
}
