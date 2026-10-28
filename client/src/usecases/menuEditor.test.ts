import { describe, expect, it } from "vitest";
import type { Category, CategoryId, ItemDraft, ItemId, MenuItem, MenuProfile, ProfileId } from "../domain/menu";
import { sortByOrder } from "../domain/ordering";
import { createMenuEditor, FIRST_PROFILE_NAME } from "./menuEditor";
import { fakeIds, fakeMenuRepository } from "./fakes";
import type { MenuSnapshot } from "./ports";

const dineIn: MenuProfile = { id: "dine-in" as ProfileId, name: "Dine-In", sortKey: "1" };
const takeaway: MenuProfile = { id: "takeaway" as ProfileId, name: "Takeaway", sortKey: "2" };
const starters: Category = { id: "starters" as CategoryId, name: "Starters", sortKey: "1" };
const mains: Category = { id: "mains" as CategoryId, name: "Mains", sortKey: "2" };

async function setup(initial: Partial<MenuSnapshot> = { profiles: [dineIn, takeaway], categories: [starters, mains] }) {
  const fake = fakeMenuRepository(initial);
  const editor = createMenuEditor(fake.repository, fakeIds());
  editor.subscribe(() => {});
  await Promise.resolve(); // first emission
  return { fake, menu: editor.commands };
}

const draft = (name: string, overrides: Partial<ItemDraft> = {}): ItemDraft => ({
  name,
  categoryId: starters.id,
  diet: "veg",
  prices: { [dineIn.id]: "100" },
  ...overrides,
});

const itemsIn = (menu: MenuSnapshot, categoryId: CategoryId) =>
  sortByOrder(menu.items.filter((i) => i.categoryId === categoryId)).map((i) => i.name);

describe("createMenu", () => {
  it("creates the first profile once, even on a double tap", async () => {
    const { fake, menu } = await setup({});
    await Promise.all([menu.createMenu(), menu.createMenu()]);
    await menu.createMenu();
    expect(fake.current().profiles.map((p) => p.name)).toEqual([FIRST_PROFILE_NAME]);
    expect(fake.writes).toHaveLength(1);
  });
});

describe("saveItem", () => {
  it("keeps typing order during fast bulk entry", async () => {
    const { fake, menu } = await setup();
    const names = ["Samosa", "Paneer Tikka", "Spring Roll", "Papad"];
    await Promise.all(names.map((name) => menu.saveItem(menu.newItem().id, draft(name))));
    expect(itemsIn(fake.current(), starters.id)).toEqual(names);
  });

  it("saves one item when Save is tapped twice", async () => {
    const { fake, menu } = await setup();
    const release = fake.hold();
    const { id } = menu.newItem();
    const first = menu.saveItem(id, draft("Samosa"));
    const second = menu.saveItem(id, draft("Samosa"));
    release();
    expect(await second).toEqual(await first);
    expect(fake.current().items).toHaveLength(1);
    expect(fake.writes).toHaveLength(1);
  });

  it("accepts a ₹0 item", async () => {
    const { fake, menu } = await setup();
    const result = await menu.saveItem(menu.newItem().id, draft("Water", { prices: { [dineIn.id]: "0" } }));
    expect(result.ok).toBe(true);
    expect(fake.current().items[0]!.prices[dineIn.id]).toEqual({ kind: "fixed", price: 0 });
  });

  it("writes nothing for an invalid draft", async () => {
    const { fake, menu } = await setup();
    const result = await menu.saveItem(menu.newItem().id, draft("", { prices: { [dineIn.id]: "12abc" } }));
    expect(result).toEqual({ ok: false, error: { name: "required", prices: { [dineIn.id]: "invalid" } } });
    expect(fake.writes).toHaveLength(0);
  });

  it("refuses a category deleted on another device meanwhile", async () => {
    const { fake, menu } = await setup();
    const result = await menu.saveItem(menu.newItem().id, draft("Samosa", { categoryId: "gone" as CategoryId }));
    expect(result).toEqual({ ok: false, error: { category: "required" } });
    expect(fake.writes).toHaveLength(0);
  });

  it("keeps an edited item in place, and moves it to the end of a new category", async () => {
    const { fake, menu } = await setup();
    const ids: ItemId[] = [];
    for (const name of ["A", "B", "C"]) {
      const { id } = menu.newItem();
      ids.push(id);
      await menu.saveItem(id, draft(name));
    }
    await menu.saveItem(ids[0]!, draft("A2"));
    expect(itemsIn(fake.current(), starters.id)).toEqual(["A2", "B", "C"]);

    await menu.saveItem(menu.newItem().id, draft("Thali", { categoryId: mains.id }));
    await menu.saveItem(ids[1]!, draft("B", { categoryId: mains.id }));
    expect(itemsIn(fake.current(), mains.id)).toEqual(["Thali", "B"]);
  });
});

describe("newItem", () => {
  it("remembers the last category and diet, and offers every profile", async () => {
    const { menu } = await setup();
    expect(menu.newItem().draft).toEqual({
      name: "",
      categoryId: starters.id,
      diet: null,
      prices: { [dineIn.id]: "", [takeaway.id]: "" },
    });
    await menu.saveItem(menu.newItem().id, draft("Thali", { categoryId: mains.id, diet: "nonVeg" }));
    expect(menu.newItem().draft).toMatchObject({ categoryId: mains.id, diet: "nonVeg" });
  });

  it("gives every draft its own id", async () => {
    const { menu } = await setup();
    expect(menu.newItem().id).not.toBe(menu.newItem().id);
  });
});

describe("addProfile", () => {
  it("starts a new price list as a copy of the first", async () => {
    const { fake, menu } = await setup({ profiles: [dineIn], categories: [starters] });
    await menu.saveItem(menu.newItem().id, draft("Samosa", { prices: { [dineIn.id]: "40" } }));
    const result = await menu.addProfile("Takeaway");

    expect(result.ok).toBe(true);
    const parcel = result.ok ? result.value.id : ("" as ProfileId);
    expect(fake.current().items[0]!.prices[parcel]).toEqual({ kind: "fixed", price: 4000 });
    expect(sortByOrder(fake.current().profiles).map((p) => p.name)).toEqual(["Dine-In", "Takeaway"]);
  });
});

describe("removing", () => {
  it("removes a category with its items, and undo brings both back", async () => {
    const { fake, menu } = await setup();
    await menu.saveItem(menu.newItem().id, draft("Samosa"));
    await menu.saveItem(menu.newItem().id, draft("Thali", { categoryId: mains.id }));

    const undo = await menu.removeCategory(starters.id);
    expect(fake.current().categories.map((c) => c.name)).toEqual(["Mains"]);
    expect(fake.current().items.map((i) => i.name)).toEqual(["Thali"]);

    await undo();
    expect(sortByOrder(fake.current().categories).map((c) => c.name)).toEqual(["Starters", "Mains"]);
    expect(itemsIn(fake.current(), starters.id)).toEqual(["Samosa"]);
  });

  it("won't remove the last profile", async () => {
    const { fake, menu } = await setup({ profiles: [dineIn], categories: [] });
    expect(await menu.removeProfile(dineIn.id)).toEqual({ ok: false, error: "lastProfile" });
    expect(fake.current().profiles).toHaveLength(1);
  });

  it("removes a profile with undo", async () => {
    const { fake, menu } = await setup();
    const result = await menu.removeProfile(takeaway.id);
    expect(fake.current().profiles.map((p) => p.name)).toEqual(["Dine-In"]);
    if (result.ok) await result.value();
    expect(fake.current().profiles).toHaveLength(2);
  });
});

describe("ordering", () => {
  it("moves an item with a single write", async () => {
    const { fake, menu } = await setup();
    const ids: ItemId[] = [];
    for (const name of ["A", "B", "C"]) {
      const { id } = menu.newItem();
      ids.push(id);
      await menu.saveItem(id, draft(name));
    }
    const before = fake.writes.length;
    await menu.moveItem(ids[2]!, starters.id, 0);
    expect(itemsIn(fake.current(), starters.id)).toEqual(["C", "A", "B"]);
    expect(fake.writes.length - before).toBe(1);
    expect(fake.writes.at(-1)).toHaveLength(1);
  });

  it("adds categories at the end and reorders them", async () => {
    const { fake, menu } = await setup();
    const drinks = await menu.addCategory("  Drinks ");
    expect(drinks).toMatchObject({ ok: true, value: { name: "Drinks" } });
    if (drinks.ok) await menu.moveCategory(drinks.value.id, 0);
    expect(sortByOrder(fake.current().categories).map((c) => c.name)).toEqual(["Drinks", "Starters", "Mains"]);
  });

  it("re-keys siblings when two devices appended with the same key", async () => {
    const tied: MenuItem[] = ["X", "Y"].map((name, i) => ({
      id: `tied-${i}` as ItemId,
      name,
      categoryId: starters.id,
      diet: "veg",
      sortKey: "5",
      prices: {},
    }));
    const { fake, menu } = await setup({ profiles: [dineIn], categories: [starters], items: tied });
    const { id } = menu.newItem();
    await menu.saveItem(id, draft("Z"));
    await menu.moveItem(id, starters.id, 1);
    expect(itemsIn(fake.current(), starters.id)).toEqual(["X", "Z", "Y"]);
  });
});

describe("failures", () => {
  it("rejects with an Error and keeps later commands working", async () => {
    const { fake, menu } = await setup();
    fake.failNextWrite();
    await expect(menu.saveItem(menu.newItem().id, draft("Samosa"))).rejects.toThrow("Storage is full");
    const retry = await menu.saveItem(menu.newItem().id, draft("Samosa"));
    expect(retry.ok).toBe(true);
    expect(fake.current().items).toHaveLength(1);
  });

  it("rejects a name that's blank or too long without writing", async () => {
    const { fake, menu } = await setup();
    expect(await menu.addCategory("   ")).toEqual({ ok: false, error: "required" });
    expect(await menu.renameProfile(dineIn.id, "x".repeat(31))).toEqual({ ok: false, error: "tooLong" });
    expect(fake.writes).toHaveLength(0);
  });
});
