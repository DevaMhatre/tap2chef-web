import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import type { Category, CategoryId, ItemId, MenuItem, ProfileId } from "../../domain/menu";
import { paise } from "../../domain/money";
import type { MenuSnapshot } from "../../usecases/ports";
import { db } from "./db";
import { dexieMenuRepository } from "./dexieMenuRepository";

const starters: Category = { id: "starters" as CategoryId, name: "Starters", sortKey: "1" };
const samosa: MenuItem = {
  id: "samosa" as ItemId,
  name: "Samosa",
  categoryId: starters.id,
  diet: "veg",
  sortKey: "1",
  prices: { ["dine-in" as ProfileId]: { kind: "fixed", price: paise(2000) } },
};

// Resolves with the first emission that satisfies `until`.
function nextMenu(until: (menu: MenuSnapshot) => boolean): Promise<MenuSnapshot> {
  return new Promise((resolve) => {
    const unsubscribe = dexieMenuRepository.subscribe((menu) => {
      if (until(menu)) {
        unsubscribe();
        resolve(menu);
      }
    });
  });
}

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe("dexieMenuRepository", () => {
  it("writes a batch and its outbox entries together", async () => {
    await dexieMenuRepository.write([
      { op: "put", table: "categories", record: starters },
      { op: "put", table: "items", record: samosa },
    ]);
    const menu = await nextMenu((m) => m.items.length === 1);
    expect(menu.categories).toEqual([starters]);
    expect(menu.items).toEqual([samosa]);
    expect(await db.outbox.count()).toBe(2);
  });

  it("soft-deletes, restores, and keeps createdAt across edits", async () => {
    await dexieMenuRepository.write([{ op: "put", table: "items", record: samosa }]);
    const created = (await db.items.get(samosa.id))!.createdAt;

    await dexieMenuRepository.write([{ op: "remove", table: "items", record: samosa }]);
    expect((await db.items.get(samosa.id))!.deleted).toBe(true);
    expect((await nextMenu(() => true)).items).toEqual([]);

    await dexieMenuRepository.write([{ op: "put", table: "items", record: { ...samosa, name: "Samosa (2)" } }]);
    const row = (await db.items.get(samosa.id))!;
    expect(row).toMatchObject({ deleted: false, name: "Samosa (2)", createdAt: created });
  });

  it("skips malformed records from sync instead of trusting them", async () => {
    const meta = { tenantId: "t", createdAt: 1, updatedAt: 1, deleted: false };
    await db.items.bulkPut([
      { ...meta, ...samosa },
      { ...meta, id: "float", name: "Bad", categoryId: "starters", diet: "veg", sortKey: "2", prices: { x: { kind: "fixed", price: 12.5 } } },
      { ...meta, id: "nodiet", name: "Bad", categoryId: "starters", sortKey: "3", prices: {} },
    ]);
    const menu = await nextMenu((m) => m.items.length > 0);
    expect(menu.items.map((i) => i.id)).toEqual(["samosa"]);
  });

  it("writes nothing if any change in the batch fails", async () => {
    const broken = { ...samosa, id: undefined } as unknown as MenuItem;
    await expect(
      dexieMenuRepository.write([
        { op: "put", table: "categories", record: starters },
        { op: "put", table: "items", record: broken },
      ]),
    ).rejects.toThrow();
    expect(await db.categories.count()).toBe(0);
    expect(await db.outbox.count()).toBe(0);
  });
});
