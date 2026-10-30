import "fake-indexeddb/auto";
import Dexie from "dexie";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "./db";
import { getScope, writeAll } from "./repo";

beforeEach(async () => {
  db.close();
  await Dexie.delete("tap2chef");
});

describe("scope", () => {
  beforeEach(() => db.open());

  it("is made once and kept", async () => {
    const [a, b] = await Promise.all([getScope(), getScope()]);
    expect(a).toEqual(b);
    expect(await getScope()).toEqual(a);
    expect(a.accountId).not.toBe(a.shopId);
    // The first brand has the account's id.
    expect(a.brandId).toBe(a.accountId);
  });

  it("stamps the account on every record, the brand on the menu's and the shop on the shop's", async () => {
    const { accountId, brandId, shopId } = await getScope();
    await writeAll([
      { table: "items", record: { id: "i1" }, op: "put" },
      { table: "orders", record: { id: "o1" }, op: "put" },
    ]);
    const item = await db.items.get("i1");
    expect(item).toMatchObject({ accountId, brandId });
    expect(item).not.toHaveProperty("shopId");
    const order = await db.orders.get("o1");
    expect(order).toMatchObject({ accountId, shopId });
    expect(order).not.toHaveProperty("brandId");
  });
});

describe("upgrade from a single tenant (version 6)", () => {
  async function seedVersion6(tenant: string | undefined) {
    const old = new Dexie("tap2chef");
    old.version(6).stores({
      meta: "key",
      settings: "id, tenantId, updatedAt",
      menuProfiles: "id, tenantId, updatedAt",
      categories: "id, tenantId, updatedAt",
      items: "id, tenantId, categoryId, updatedAt",
      orders: "id, tenantId, status, businessDate, updatedAt",
      orderItems: "id, tenantId, orderId, updatedAt",
      expenses: "id, tenantId, businessDate, updatedAt",
      outbox: "++seq, table, recordId",
      diningTables: "id, tenantId, updatedAt",
      outOfStock: "id, tenantId, businessDate, updatedAt",
      payments: "id, tenantId, orderId, updatedAt",
      drawerEntries: "id, tenantId, businessDate, updatedAt",
    });
    const base = { tenantId: tenant, createdAt: 1, updatedAt: 1, deleted: false };
    if (tenant) await old.table("meta").put({ key: "tenantId", value: tenant });
    await old.table("items").put({ id: "i1", name: "Samosa", ...base });
    await old.table("payments").put({ id: "p1", orderId: "o1", ...base });
    await old.table("outbox").add({ table: "items", recordId: "i1", queuedAt: 1 });
    old.close();
  }

  it("keeps the tenant as the account, gives everything one shop, and loses nothing", async () => {
    await seedVersion6("local-abc");
    await db.open();

    const scope = await getScope();
    expect(scope.accountId).toBe("abc");
    expect(await db.meta.get("tenantId")).toBeUndefined();

    const item = await db.items.get("i1");
    expect(item).toMatchObject({ name: "Samosa", accountId: "abc", brandId: "abc", createdAt: 1 });
    expect(item).not.toHaveProperty("tenantId");
    expect(item).not.toHaveProperty("shopId");
    expect(await db.payments.get("p1")).toMatchObject({ orderId: "o1", accountId: "abc", shopId: scope.shopId });
    expect(await db.outbox.count()).toBe(1);
  });

  it("makes an account for a device that never had a tenant", async () => {
    await seedVersion6(undefined);
    await db.open();
    const { accountId } = await getScope();
    expect(accountId).toMatch(/^[0-9a-f-]{36}$/);
    expect(await db.items.get("i1")).toMatchObject({ accountId });
  });
});

describe("upgrade to brands (version 7)", () => {
  async function seedVersion7() {
    const old = new Dexie("tap2chef");
    old.version(7).stores({
      meta: "key",
      menuProfiles: "id, updatedAt",
      categories: "id, updatedAt",
      items: "id, categoryId, updatedAt",
      orders: "id, status, businessDate, updatedAt",
      orderItems: "id, orderId, updatedAt",
      expenses: "id, businessDate, updatedAt",
      outbox: "++seq, table, recordId",
      diningTables: "id, updatedAt",
      outOfStock: "id, businessDate, updatedAt",
      payments: "id, orderId, updatedAt",
      drawerEntries: "id, businessDate, updatedAt",
    });
    const base = { accountId: "acc", createdAt: 1, updatedAt: 1, deleted: false };
    await old.table("meta").bulkPut([{ key: "accountId", value: "acc" }, { key: "shopId", value: "shop" }]);
    await old.table("menuProfiles").put({ id: "dine", name: "Dine-In", sortKey: "1", ...base });
    await old.table("categories").put({ id: "c1", name: "Starters", sortKey: "1", ...base });
    await old.table("items").put({ id: "i1", name: "Samosa", ...base });
    await old.table("orders").put({ id: "o1", shopId: "shop", ...base });
    old.close();
  }

  it("puts the menu in the account's first brand, sends nothing, and leaves the shop's records alone", async () => {
    await seedVersion7();
    await db.open();

    expect(await getScope()).toEqual({ accountId: "acc", brandId: "acc", shopId: "shop" });
    for (const row of [await db.menuProfiles.get("dine"), await db.categories.get("c1"), await db.items.get("i1")]) {
      expect(row).toMatchObject({ accountId: "acc", brandId: "acc", updatedAt: 1 });
    }
    expect(await db.orders.get("o1")).not.toHaveProperty("brandId");
    // Every device of the account names the same brand itself: nothing to send.
    expect(await db.outbox.count()).toBe(0);
  });
});
