import Dexie, { type EntityTable } from "dexie";
import { newId } from "../id";

// Sync metadata every stored record carries. This is a storage concern, so it
// lives here rather than in the domain.
export interface StoredRecord {
  id: string;
  accountId: string;
  /** Only on shop-level records; the menu belongs to the whole account. */
  shopId?: string;
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

// The account's catalog: every shop sells from it.
export const ACCOUNT_TABLES = ["menuProfiles", "categories", "items"] as const;

// One restaurant's service and money.
export const SHOP_TABLES = [
  "orders",
  "orderItems",
  "expenses",
  "diningTables",
  "outOfStock",
  "payments",
  "drawerEntries",
] as const;

export const SYNCED_TABLES = [...ACCOUNT_TABLES, ...SHOP_TABLES] as const;

export type SyncedTable = (typeof SYNCED_TABLES)[number];

export const isShopTable = (table: SyncedTable): boolean => (SHOP_TABLES as readonly string[]).includes(table);

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

// Step 7: expenses are read by the trading day they belong to (the old
// index was by creation time, which a backdated expense would not match).
db.version(5).stores({
  expenses: "id, tenantId, businessDate, updatedAt",
});

// Step 7c: what the cash box started with and held, one record per fact per day.
db.version(6).stores({
  drawerEntries: "id, tenantId, businessDate, updatedAt",
});

// Step 8a: a device's single `tenantId` becomes the account it belongs to and
// the shop it works in. The ids are made here, on the device, and the server
// will adopt them at sign-up, so records are never re-tagged. The unused
// `settings` table goes, and so do the tenant indexes nothing queried.
db.version(7)
  .stores({
    settings: null,
    menuProfiles: "id, updatedAt",
    categories: "id, updatedAt",
    items: "id, categoryId, updatedAt",
    orders: "id, status, businessDate, updatedAt",
    orderItems: "id, orderId, updatedAt",
    expenses: "id, businessDate, updatedAt",
    diningTables: "id, updatedAt",
    outOfStock: "id, businessDate, updatedAt",
    payments: "id, orderId, updatedAt",
    drawerEntries: "id, businessDate, updatedAt",
  })
  .upgrade(async (tx) => {
    const meta = tx.table<MetaRow, string>("meta");
    const tenant = await meta.get("tenantId");
    const accountId = tenant?.value.replace(/^local-/, "") ?? newId();
    const shopId = newId();
    await meta.bulkPut([{ key: "accountId", value: accountId }, { key: "shopId", value: shopId }]);
    await meta.delete("tenantId");

    for (const table of SYNCED_TABLES) {
      const shop = isShopTable(table);
      await tx.table<StoredRecord, string>(table).toCollection().modify((row) => {
        delete row.tenantId;
        row.accountId = accountId;
        if (shop) row.shopId = shopId;
      });
    }
  });
