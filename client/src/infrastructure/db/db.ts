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
  "diningTables",
  "outOfStock",
  "payments",
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

// Step 5: tables, and "out today" as its own record per item per day. Open
// orders are read by status; a day's orders (takeaway tokens) by date.
db.version(3).stores({
  orders: "id, tenantId, status, businessDate, updatedAt",
  diningTables: "id, tenantId, updatedAt",
  outOfStock: "id, tenantId, businessDate, updatedAt",
});

// Step 6: money received is its own record per payment, read by order, so
// two devices taking parts of one bill both count.
db.version(4).stores({
  payments: "id, tenantId, orderId, updatedAt",
});
