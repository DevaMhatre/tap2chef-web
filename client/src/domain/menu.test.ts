import { describe, expect, it } from "vitest";
import {
  groupByCategory,
  isDuplicateName,
  itemToDraft,
  menuFor,
  resolvePrice,
  validateItemDraft,
  validateName,
  validatePrice,
  withPriceEverywhere,
  type Category,
  type CategoryId,
  type ItemDraft,
  type ItemId,
  type ItemOverride,
  type MenuItem,
  type ProfileId,
} from "./menu";
import { paise } from "./money";

const dineIn = "dine-in" as ProfileId;
const takeaway = "takeaway" as ProfileId;
const starters = "starters" as CategoryId;
const mains = "mains" as CategoryId;

const draft = (overrides: Partial<ItemDraft> = {}): ItemDraft => ({
  name: "Paneer Tikka",
  categoryId: starters,
  diet: "veg",
  prices: { [dineIn]: "220", [takeaway]: "240" },
  ...overrides,
});

const item = (id: string, overrides: Partial<MenuItem> = {}): MenuItem => ({
  id: id as ItemId,
  name: id,
  categoryId: starters,
  diet: "veg",
  sortKey: "1",
  prices: { [dineIn]: { kind: "fixed", price: paise(10000) } },
  ...overrides,
});

describe("validateName", () => {
  it("trims and collapses whitespace", () => {
    expect(validateName("  Paneer   Tikka ", 60)).toEqual({ ok: true, value: "Paneer Tikka" });
  });

  it("rejects empty and over-long names", () => {
    expect(validateName("   ", 60)).toEqual({ ok: false, error: "required" });
    expect(validateName("x".repeat(61), 60)).toEqual({ ok: false, error: "tooLong" });
  });
});

describe("isDuplicateName", () => {
  const others = [{ id: "1", name: "Paneer Tikka" }];

  it("matches ignoring case and spacing", () => {
    expect(isDuplicateName(" paneer  tikka", others)).toBe(true);
  });

  it("ignores the record being edited", () => {
    expect(isDuplicateName("Paneer Tikka", others, "1")).toBe(false);
  });
});

describe("validatePrice", () => {
  it("accepts ₹0", () => {
    expect(validatePrice("0")).toEqual({ ok: true, value: 0 });
  });

  it("separates an empty field from a bad one", () => {
    expect(validatePrice(" ")).toEqual({ ok: false, error: "required" });
    expect(validatePrice("12.505")).toEqual({ ok: false, error: "invalid" });
  });

  it("catches an extra zero", () => {
    expect(validatePrice("100000")).toEqual({ ok: true, value: 1_00_000_00 });
    expect(validatePrice("1000000")).toEqual({ ok: false, error: "tooHigh" });
  });
});

describe("validateItemDraft", () => {
  it("produces item fields with a price per profile", () => {
    expect(validateItemDraft(draft({ name: " Paneer  Tikka " }))).toEqual({
      ok: true,
      value: {
        name: "Paneer Tikka",
        categoryId: starters,
        diet: "veg",
        prices: {
          [dineIn]: { kind: "fixed", price: 22000 },
          [takeaway]: { kind: "fixed", price: 24000 },
        },
      },
    });
  });

  it("leaves out profiles the item isn't sold in", () => {
    const result = validateItemDraft(draft({ prices: { [dineIn]: "220" } }));
    expect(result.ok && Object.keys(result.value.prices)).toEqual([dineIn]);
  });

  it("reports every problem at once", () => {
    const result = validateItemDraft(
      draft({ name: "", categoryId: null, diet: null, prices: { [dineIn]: "", [takeaway]: "abc" } }),
    );
    expect(result).toEqual({
      ok: false,
      error: {
        name: "required",
        category: "required",
        diet: "required",
        prices: { [dineIn]: "required", [takeaway]: "invalid" },
      },
    });
  });

  it("requires the item to be sold somewhere", () => {
    expect(validateItemDraft(draft({ prices: {} }))).toEqual({
      ok: false,
      error: { profiles: "noneSelected" },
    });
  });
});

describe("itemToDraft", () => {
  it("round-trips through validation unchanged", () => {
    const tikka = item("tikka", { prices: { [dineIn]: { kind: "fixed", price: paise(22050) } } });
    expect(itemToDraft(tikka).prices).toEqual({ [dineIn]: "220.50" });
    expect(validateItemDraft(itemToDraft(tikka))).toEqual({
      ok: true,
      value: { name: tikka.name, categoryId: tikka.categoryId, diet: tikka.diet, prices: tikka.prices },
    });
  });
});

describe("withPriceEverywhere", () => {
  it("fills every offered profile and only those", () => {
    expect(withPriceEverywhere(draft({ prices: { [dineIn]: "", [takeaway]: "9" } }), "40").prices).toEqual({
      [dineIn]: "40",
      [takeaway]: "40",
    });
    expect(withPriceEverywhere(draft({ prices: { [dineIn]: "" } }), "40").prices).toEqual({ [dineIn]: "40" });
  });
});

describe("groupByCategory", () => {
  const categories: Category[] = [
    { id: mains, name: "Mains", sortKey: "2" },
    { id: starters, name: "Starters", sortKey: "1" },
  ];

  it("sorts sections and items, keeping empty categories", () => {
    const sections = groupByCategory(categories, [
      item("b", { sortKey: "2" }),
      item("a", { sortKey: "1" }),
    ]);
    expect(sections.map((s) => (s.kind === "category" ? s.category.name : s.kind))).toEqual([
      "Starters",
      "Mains",
    ]);
    expect(sections[0]!.items.map((i) => i.id)).toEqual(["a", "b"]);
    expect(sections[1]!.items).toEqual([]);
  });

  it("keeps items whose category was deleted elsewhere", () => {
    const sections = groupByCategory(categories, [item("lost", { categoryId: "gone" as CategoryId })]);
    expect(sections.at(-1)).toEqual({ kind: "uncategorized", items: [expect.objectContaining({ id: "lost" })] });
  });
});

describe("menuFor", () => {
  const categories: Category[] = [
    { id: starters, name: "Starters", sortKey: "1" },
    { id: mains, name: "Mains", sortKey: "2" },
  ];
  const items = [
    item("tikka", {
      prices: {
        [dineIn]: { kind: "fixed", price: paise(22000) },
        [takeaway]: { kind: "fixed", price: paise(24000) },
      },
    }),
    item("thali", { categoryId: mains }), // dine-in only
  ];

  it("shows each profile's own price", () => {
    const [section] = menuFor(takeaway, categories, items);
    expect(section!.items).toEqual([
      { item: items[0], pricing: { kind: "fixed", price: 24000 } },
    ]);
  });

  it("hides items and sections a profile doesn't sell", () => {
    expect(menuFor(takeaway, categories, items)).toHaveLength(1);
    expect(menuFor(dineIn, categories, items)).toHaveLength(2);
  });

  it("applies a shop's own price and its not-sold-here", () => {
    const overrides: ItemOverride[] = [
      { itemId: "tikka" as ItemId, profiles: { [dineIn]: { kind: "price", pricing: { kind: "fixed", price: paise(26000) } } } },
      { itemId: "thali" as ItemId, profiles: { [dineIn]: { kind: "notSold" } } },
    ];
    const sections = menuFor(dineIn, categories, items, overrides);
    expect(sections).toHaveLength(1);
    expect(sections[0]!.items[0]!.pricing).toEqual({ kind: "fixed", price: 26000 });
  });
});

describe("resolvePrice", () => {
  const tikka = item("tikka");

  it("inherits the account price when the shop has no override", () => {
    expect(resolvePrice(tikka, dineIn)).toEqual({ kind: "fixed", price: 10000 });
    expect(resolvePrice(tikka, dineIn, { itemId: tikka.id, profiles: {} })).toEqual({ kind: "fixed", price: 10000 });
  });

  it("lets a shop sell in a profile the account menu doesn't", () => {
    const override: ItemOverride = {
      itemId: tikka.id,
      profiles: { [takeaway]: { kind: "price", pricing: { kind: "fixed", price: paise(0) } } },
    };
    expect(resolvePrice(tikka, takeaway, override)).toEqual({ kind: "fixed", price: 0 });
  });
});
