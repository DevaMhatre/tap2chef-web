// The tables a device syncs, as named in client/src/infrastructure/db/db.ts,
// and what it takes to write each. The server stores their records as they
// come: the rules for an order or a payment live on the device; the server
// guards whose a record is and who may write it.

// The brand's catalog: every shop of the brand sells from it.
export const BRAND_TABLES = ["menuProfiles", "categories", "items"];

// One restaurant's service and money.
export const SHOP_TABLES = [
  "orders",
  "orderItems",
  "expenses",
  "diningTables",
  "outOfStock",
  "payments",
  "drawerEntries",
  "shopDetails",
  "repayments",
];

export const WRITE_PERMISSION = {
  menuProfiles: "menu.edit",
  categories: "menu.edit",
  items: "menu.edit",
  orders: "orders.take",
  orderItems: "orders.take",
  outOfStock: "stock.markOut",
  payments: "payments.take",
  expenses: "expenses.note",
  diningTables: "tables.edit",
  drawerEntries: "day.view",
  /** Money a regular brings back for bills on their name. */
  repayments: "payments.later",
  /** The restaurant's name and how its customers order. */
  shopDetails: "shops.manage",
};

export const isShopTable = (table) => SHOP_TABLES.includes(table);

/** How long after it reached the account a payment or expense may still be undone by whoever took it. */
export const UNDO_WINDOW_MS = 2 * 60_000;

/**
 * What a record's content needs beyond its table: a bill put on a regular's
 * name (or one already there changed), a discount given or changed, a
 * payment's method or amount put right, a payment or expense taken off or put
 * back, or deleted after the moment for Undo has passed. Checked against what
 * is stored, so a waiter's phone can still move a bill already on a name (two
 * orders at one table join), carry an agreed discount when the bill settles,
 * and undo the money it just took. `stored` is the record as the server holds
 * it (`data`, `deleted`, `arrivedAt`), or undefined for a new one.
 */
export function contentPermissions(table, record, stored, now = Date.now()) {
  const needs = [];
  const before = stored?.data;
  const live = stored && !stored.deleted;
  if (table === "payments" || table === "expenses" || table === "repayments") {
    const undoable = live && now - stored.arrivedAt <= UNDO_WINDOW_MS;
    if (live && record.deleted && !undoable) needs.push(table === "expenses" ? "expenses.remove" : table === "repayments" ? "payments.later" : "payments.remove");
  }
  if (table === "payments" && !record.deleted) {
    if (record.method === "later" && before?.method !== "later") needs.push("payments.later");
    else if (before?.method === "later" && (record.customer !== before.customer || record.phone !== before.phone || record.amount !== before.amount)) {
      needs.push("payments.later");
    } else if (before && (record.method !== before.method || record.amount !== before.amount)) needs.push("payments.correct");
    if (record.removedAt !== before?.removedAt) needs.push("payments.remove");
  }
  if (table === "expenses" && !record.deleted && record.removedAt !== before?.removedAt) needs.push("expenses.remove");
  if (table === "orders") {
    const discount = record.state?.discount;
    const agreed = before?.state?.discount;
    if (discount && (agreed?.amount !== discount.amount || agreed?.reason !== discount.reason)) needs.push("bills.discount");
  }
  return needs;
}
