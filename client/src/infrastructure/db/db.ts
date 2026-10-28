import Dexie, { type EntityTable } from "dexie";

// Sync metadata every stored record carries. This is a storage concern, so it
// lives here rather than in the domain.
export interface StoredRecord {
  id: string;
  tenantId: string;
  createdAt: number;
  updatedAt: number;
  /** Soft delete, so deletions can sync to other devices. */
  deleted: boolean;
  [field: string]: unknown;
}

export interface MetaRow {
  key: string;
  value: string;
}

export interface OutboxRow {
  seq?: number;
  table: SyncedTable;
  recordId: string;
  queuedAt: number;
}

export const SYNCED_TABLES = [
  "settings",
  "menuProfiles",
  "categories",
  "items",
  "orders",
  "orderItems",
  "expenses",
] as const;

export type SyncedTable = (typeof SYNCED_TABLES)[number];

type Tables = { [T in SyncedTable]: EntityTable<StoredRecord, "id"> } & {
  meta: EntityTable<MetaRow, "key">;
  outbox: EntityTable<OutboxRow, "seq">;
};

// Local-first store: every screen reads and writes here; the server is only
// a sync target.
export const db = new Dexie("tap2chef") as Dexie & Tables;

// Only indexed fields are listed; Dexie stores every other field as-is.
db.version(1).stores({
  meta: "key",
  settings: "id, tenantId, updatedAt",
  menuProfiles: "id, tenantId, updatedAt",
  categories: "id, tenantId, menuProfileId, updatedAt",
  items: "id, tenantId, categoryId, updatedAt",
  orders: "id, tenantId, status, tableNumber, createdAt, updatedAt",
  orderItems: "id, tenantId, orderId, updatedAt",
  expenses: "id, tenantId, createdAt, updatedAt",
  // Changes waiting to be pushed to the server, oldest first.
  outbox: "++seq, table, recordId",
});

// The menu is shared by every profile, so categories no longer belong to one.
db.version(2).stores({
  categories: "id, tenantId, updatedAt",
});
