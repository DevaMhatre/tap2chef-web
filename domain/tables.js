// The tables a device syncs, as named in client/src/infrastructure/db/db.ts,
// and what it takes to write each. The server stores their records as they
// come: the rules for an order or a payment live on the device; the server
// guards whose a record is and who may write it.

// The account's catalog: every shop sells from it.
export const ACCOUNT_TABLES = ["menuProfiles", "categories", "items"];

// One restaurant's service and money.
export const SHOP_TABLES = [
  "orders",
  "orderItems",
  "expenses",
  "diningTables",
  "outOfStock",
  "payments",
  "drawerEntries",
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
};

export const isShopTable = (table) => SHOP_TABLES.includes(table);
