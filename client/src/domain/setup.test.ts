import { describe, expect, it } from "vitest";
import { firstPriceListName, readDishRows, readService, stepAfterService, type DishRow } from "./setup";
import { STARTER_MENUS } from "./starterMenus";

describe("how customers order", () => {
  it("is dine-in, takeaway or both, never neither", () => {
    expect(readService({ dineIn: true, takeaway: false })).toEqual({ ok: true, value: "dineIn" });
    expect(readService({ dineIn: false, takeaway: true })).toEqual({ ok: true, value: "takeaway" });
    expect(readService({ dineIn: true, takeaway: true })).toEqual({ ok: true, value: "both" });
    expect(readService({ dineIn: false, takeaway: false })).toEqual({ ok: false, error: "none" });
  });

  it("asks about tables only where customers sit down", () => {
    expect(stepAfterService("dineIn")).toEqual({ step: "tables" });
    expect(stepAfterService("both")).toEqual({ step: "tables" });
    expect(stepAfterService("takeaway")).toEqual({ step: "menu" });
  });

  it("names a takeaway-only kitchen's price list Takeaway", () => {
    expect(firstPriceListName("takeaway")).toBe("Takeaway");
    expect(firstPriceListName("both")).toBe("Dine-In");
    expect(firstPriceListName("dineIn")).toBe("Dine-In");
  });
});

const row = (over: Partial<Extract<DishRow, { kind: "starter" }>>): DishRow => ({
  kind: "starter",
  key: "k",
  category: "Biryani",
  name: "Chicken Biryani",
  diet: "nonVeg",
  price: "",
  ...over,
});

describe("the starter list", () => {
  it("takes the dishes given a price and skips the rest", () => {
    const result = readDishRows([
      row({ key: "a", price: "180" }),
      row({ key: "b", name: "Veg Biryani", diet: "veg", price: "" }),
      row({ key: "c", name: "Water", diet: "veg", price: "0" }),
    ]);
    expect(result).toEqual({
      ok: true,
      value: [
        { category: "Biryani", name: "Chicken Biryani", diet: "nonVeg", price: 18000 },
        { category: "Biryani", name: "Water", diet: "veg", price: 0 },
      ],
    });
  });

  it("parses prices strictly, as everywhere", () => {
    const result = readDishRows([row({ key: "a", price: "12.505" }), row({ key: "b", price: "1000000" }), row({ key: "c", price: "12abc" })]);
    expect(result).toEqual({ ok: false, error: { a: { price: "invalid" }, b: { price: "tooHigh" }, c: { price: "invalid" } } });
  });

  it("asks for what an owner's own dish is missing, and skips an untouched one", () => {
    const own = (over: Partial<Extract<DishRow, { kind: "own" }>>): DishRow => ({
      kind: "own",
      key: "k",
      category: "Mine",
      name: "",
      diet: null,
      price: "",
      ...over,
    });
    const result = readDishRows([
      own({ key: "blank" }),
      own({ key: "noPrice", name: "Kheer", diet: "veg" }),
      own({ key: "noName", price: "40", diet: "veg" }),
      own({ key: "noDiet", name: "Kheer", price: "40" }),
    ]);
    expect(result).toEqual({
      ok: false,
      error: { noPrice: { price: "required" }, noName: { name: "required" }, noDiet: { diet: "required" } },
    });
  });

  it("has dishes with unique names in every list, each with a diet", () => {
    for (const menu of STARTER_MENUS) {
      const names = menu.sections.flatMap((s) => s.dishes.map((d) => d.name.toLowerCase()));
      expect(new Set(names).size, menu.id).toBe(names.length);
      expect(names.length, menu.id).toBeGreaterThanOrEqual(15);
      for (const section of menu.sections) for (const dish of section.dishes) expect(["veg", "nonVeg", "egg"]).toContain(dish.diet);
    }
  });

  it("never marks a dish named for meat or egg as veg", () => {
    for (const menu of STARTER_MENUS) {
      for (const dish of menu.sections.flatMap((s) => s.dishes)) {
        if (/chicken|mutton|fish|prawn/i.test(dish.name)) expect(dish.diet, dish.name).toBe("nonVeg");
        if (/\begg\b/i.test(dish.name)) expect(dish.diet, dish.name).toBe("egg");
      }
    }
  });
});
