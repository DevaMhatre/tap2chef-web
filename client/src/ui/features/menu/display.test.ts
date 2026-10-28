import { describe, expect, it } from "vitest";
import type { CategoryId, ItemId, MenuItem, MenuProfile, ProfileId } from "../../../domain/menu";
import { paise } from "../../../domain/money";
import { priceSummary } from "./display";

const dineIn: MenuProfile = { id: "d" as ProfileId, name: "Dine-In", sortKey: "1" };
const takeaway: MenuProfile = { id: "t" as ProfileId, name: "Takeaway", sortKey: "2" };
const item = (prices: MenuItem["prices"]): MenuItem => ({
  id: "i" as ItemId,
  name: "Samosa",
  categoryId: "c" as CategoryId,
  diet: "veg",
  sortKey: "1",
  prices,
});
const fixed = (amount: number) => ({ kind: "fixed" as const, price: paise(amount) });
// Intl puts no-break spaces in some locales; compare on plain spaces.
const plain = (text: string) => text.replace(/\s/g, " ");

describe("priceSummary", () => {
  const profiles = [dineIn, takeaway];

  it("shows one price when every list charges the same", () => {
    expect(plain(priceSummary(item({ d: fixed(4000), t: fixed(4000) } as MenuItem["prices"]), profiles))).toBe("₹40");
  });

  it("shows each price when they differ", () => {
    expect(plain(priceSummary(item({ d: fixed(4000), t: fixed(5050) } as MenuItem["prices"]), profiles))).toBe(
      "₹40 · ₹50.50",
    );
    expect(
      plain(priceSummary(item({ d: fixed(4000), t: fixed(5050) } as MenuItem["prices"]), profiles, { named: true })),
    ).toBe("Dine-In ₹40 · Takeaway ₹50.50");
  });

  it("names the lists that sell it when some don't", () => {
    expect(plain(priceSummary(item({ d: fixed(0) } as MenuItem["prices"]), profiles))).toBe("₹0 · Dine-In only");
    expect(priceSummary(item({}), profiles)).toBe("Not on sale");
  });
});
