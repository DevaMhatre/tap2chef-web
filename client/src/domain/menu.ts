import { paise, parseRupees, toRupeeText, type Paise } from "./money";
import { sortByOrder } from "./ordering";
import { err, ok, type Result } from "./result";

// Branded so a category id can't be passed where a profile id is expected.
export type Id<Brand extends string> = string & { readonly __brand: Brand };
export type ProfileId = Id<"ProfileId">;
export type CategoryId = Id<"CategoryId">;
export type ItemId = Id<"ItemId">;

export type Diet = "veg" | "nonVeg" | "egg";

/** "Half", "Full". Named, not an enum, so a quarter or a large later needs no new shape. */
export type Portion = { name: string; price: Paise };

export type Pricing =
  | { kind: "fixed"; price: Paise }
  // Smallest first. Today always Half, then Full.
  | { kind: "portions"; portions: Portion[] };

export const HALF = "Half";
export const FULL = "Full";

/** One way to order a dish: the dish itself, or one of its portions. */
export type Choice = { portion?: string; price: Paise };

/** Every way a dish can be ordered from one list, in menu order. */
export function choicesOf(pricing: Pricing): Choice[] {
  switch (pricing.kind) {
    case "fixed":
      return [{ price: pricing.price }];
    case "portions":
      return pricing.portions.map((p) => ({ portion: p.name, price: p.price }));
  }
}

/** What one unit costs, or undefined if the dish has no such portion (any more). */
export function priceOf(pricing: Pricing, portion: string | undefined): Paise | undefined {
  return choicesOf(pricing).find((c) => c.portion === portion)?.price;
}

/** The price a menu row leads with: the dish's, or its largest portion's. */
export function mainPrice(pricing: Pricing): Paise {
  return choicesOf(pricing).at(-1)!.price;
}

export const samePricing = (a: Pricing, b: Pricing): boolean => {
  const [x, y] = [choicesOf(a), choicesOf(b)];
  return x.length === y.length && x.every((c, i) => c.portion === y[i]!.portion && c.price === y[i]!.price);
};

/** A price list chosen per order, e.g. "Dine-In" or "Takeaway". */
export type MenuProfile = { id: ProfileId; name: string; sortKey: string };

/** Shared by every profile; only prices differ between profiles. */
export type Category = { id: CategoryId; name: string; sortKey: string };

export type MenuItem = {
  id: ItemId;
  name: string;
  categoryId: CategoryId;
  diet: Diet;
  sortKey: string;
  /** A missing profile means the item isn't sold there (e.g. dine-in only). */
  prices: Partial<Record<ProfileId, Pricing>>;
};

// ---------------------------------------------------------------- names

export const NAME_MAX = { item: 60, category: 40, profile: 30 } as const;
export const MAX_ITEM_PRICE = paise(1_00_000_00); // ₹1,00,000 — catches an extra zero

export type NameError = "required" | "tooLong";

export function normalizeName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

export function validateName(raw: string, max: number): Result<string, NameError> {
  const name = normalizeName(raw);
  if (name === "") return err("required");
  if (name.length > max) return err("tooLong");
  return ok(name);
}

// A warning, never a rule: two offline devices can always create the same
// name, so uniqueness is not something this app can promise.
export function isDuplicateName(
  name: string,
  others: readonly { id: string; name: string }[],
  selfId?: string,
): boolean {
  const key = normalizeName(name).toLowerCase();
  return others.some((o) => o.id !== selfId && normalizeName(o.name).toLowerCase() === key);
}

// ---------------------------------------------------------------- items

/** The add/edit form as typed. Prices are rupee text per profile. */
export type ItemDraft = {
  name: string;
  categoryId: CategoryId | null;
  diet: Diet | null;
  /** A missing profile means not sold there; "" means the price is still to fill in. Full price when sold half too. */
  prices: Partial<Record<ProfileId, string>>;
  /** Half prices per profile, when the dish is also sold half; null when it's sold one way. */
  halves: Partial<Record<ProfileId, string>> | null;
};

export type ItemFields = Omit<MenuItem, "id" | "sortKey">;

export type PriceError = "required" | "invalid" | "tooHigh";
/** `notLess`: a half at or above the full price is the two typed the wrong way round. */
export type HalfError = PriceError | "notLess";

export type ItemDraftErrors = {
  name?: NameError;
  category?: "required";
  diet?: "required";
  /** The item is switched off in every profile. */
  profiles?: "noneSelected";
  prices?: Partial<Record<ProfileId, PriceError>>;
  halves?: Partial<Record<ProfileId, HalfError>>;
};

export function validatePrice(text: string): Result<Paise, PriceError> {
  if (text.trim() === "") return err("required");
  const amount = parseRupees(text);
  if (amount === undefined) return err("invalid");
  if (amount > MAX_ITEM_PRICE) return err("tooHigh");
  return ok(amount); // ₹0 is a real price: complimentary water, papad
}

export function validateItemDraft(draft: ItemDraft): Result<ItemFields, ItemDraftErrors> {
  const errors: ItemDraftErrors = {};

  const name = validateName(draft.name, NAME_MAX.item);
  if (!name.ok) errors.name = name.error;
  if (draft.categoryId === null) errors.category = "required";
  if (draft.diet === null) errors.diet = "required";

  const prices: Partial<Record<ProfileId, Pricing>> = {};
  const priceErrors: Partial<Record<ProfileId, PriceError>> = {};
  const halfErrors: Partial<Record<ProfileId, HalfError>> = {};
  let soldSomewhere = false;
  for (const [profileId, text] of Object.entries(draft.prices) as [ProfileId, string | undefined][]) {
    if (text === undefined) continue;
    soldSomewhere = true;
    const full = validatePrice(text);
    if (!full.ok) priceErrors[profileId] = full.error;
    if (draft.halves === null) {
      if (full.ok) prices[profileId] = { kind: "fixed", price: full.value };
      continue;
    }
    const half = validatePrice(draft.halves[profileId] ?? "");
    if (!half.ok) halfErrors[profileId] = half.error;
    else if (full.ok && half.value >= full.value) halfErrors[profileId] = "notLess";
    else if (full.ok) {
      prices[profileId] = {
        kind: "portions",
        portions: [
          { name: HALF, price: half.value },
          { name: FULL, price: full.value },
        ],
      };
    }
  }
  if (!soldSomewhere) errors.profiles = "noneSelected";
  if (Object.keys(priceErrors).length > 0) errors.prices = priceErrors;
  if (Object.keys(halfErrors).length > 0) errors.halves = halfErrors;

  if (!name.ok || draft.categoryId === null || draft.diet === null || Object.keys(errors).length > 0) {
    return err(errors);
  }
  return ok({ name: name.value, categoryId: draft.categoryId, diet: draft.diet, prices });
}

/** The edit form for an existing item: prices back to rupee text. */
export function itemToDraft(item: MenuItem): ItemDraft {
  const sold = Object.entries(item.prices).flatMap(([id, pricing]) => (pricing ? [[id, pricing] as const] : []));
  const halved = sold.some(([, p]) => p.kind === "portions");
  return {
    name: item.name,
    categoryId: item.categoryId,
    diet: item.diet,
    prices: Object.fromEntries(sold.map(([id, p]) => [id, toRupeeText(mainPrice(p))])),
    halves: halved
      ? Object.fromEntries(sold.map(([id, p]) => [id, p.kind === "portions" ? toRupeeText(p.portions[0]!.price) : ""]))
      : null,
  };
}

/**
 * Quick add has one price field (and one half price); each applies to every
 * profile the draft offers. A null half means the dish is sold one way.
 */
export function withPriceEverywhere(draft: ItemDraft, text: string, half: string | null = null): ItemDraft {
  const ids = Object.keys(draft.prices);
  return {
    ...draft,
    prices: Object.fromEntries(ids.map((id) => [id, text])),
    halves: half === null ? null : Object.fromEntries(ids.map((id) => [id, half])),
  };
}

// ---------------------------------------------------------------- shop overrides

// The menu belongs to a brand; each of its shops stores only how it differs.
// No override means the shop sells the item exactly as the brand's menu says.
export type ProfileOverride = { kind: "price"; pricing: Pricing } | { kind: "notSold" };

export type ItemOverride = {
  itemId: ItemId;
  /** Profiles not named here inherit the brand's price. */
  profiles: Partial<Record<ProfileId, ProfileOverride>>;
};

/** This shop's price for an item in a profile, or undefined if not sold there. */
export function resolvePrice(
  item: MenuItem,
  profileId: ProfileId,
  override?: ItemOverride,
): Pricing | undefined {
  const local = override?.profiles[profileId];
  if (!local) return item.prices[profileId];
  return local.kind === "price" ? local.pricing : undefined;
}

// ---------------------------------------------------------------- menu views

export type MenuSection<T> =
  | { kind: "category"; category: Category; items: T[] }
  // Items whose category was deleted on another device before sync. They are
  // shown, never silently dropped.
  | { kind: "uncategorized"; items: T[] };

/** The builder's view: every category (empty ones too), every item. */
export function groupByCategory(
  categories: readonly Category[],
  items: readonly MenuItem[],
): MenuSection<MenuItem>[] {
  const byCategory = new Map<CategoryId, MenuItem[]>(categories.map((c) => [c.id, []]));
  const orphans: MenuItem[] = [];
  for (const item of sortByOrder(items)) {
    (byCategory.get(item.categoryId) ?? orphans).push(item);
  }

  const sections: MenuSection<MenuItem>[] = sortByOrder(categories).map((category) => ({
    kind: "category",
    category,
    items: byCategory.get(category.id) ?? [],
  }));
  if (orphans.length > 0) sections.push({ kind: "uncategorized", items: orphans });
  return sections;
}

export type OrderableItem = { item: MenuItem; pricing: Pricing };

/** The order screen's view of one profile: only what it sells, no empty sections. */
export function menuFor(
  profileId: ProfileId,
  categories: readonly Category[],
  items: readonly MenuItem[],
  overrides: readonly ItemOverride[] = [],
): MenuSection<OrderableItem>[] {
  const overrideFor = new Map(overrides.map((o) => [o.itemId, o]));
  return groupByCategory(categories, items).flatMap((section) => {
    const orderable = section.items.flatMap((item) => {
      const pricing = resolvePrice(item, profileId, overrideFor.get(item.id));
      return pricing ? [{ item, pricing }] : [];
    });
    return orderable.length > 0 ? [{ ...section, items: orderable }] : [];
  });
}

// Mid-rush search: "pan" finds Paneer Tikka by its start, "tikka" by a later
// word, "pt" by its initials. Anything else is noise on an 80-dish menu.
export function matchesSearch(name: string, query: string): boolean {
  const q = normalizeName(query).toLowerCase();
  if (q === "") return true;
  const words = normalizeName(name).toLowerCase().split(" ");
  if (words.some((_, i) => words.slice(i).join(" ").startsWith(q))) return true;
  return !q.includes(" ") && q.length > 1 && words.map((w) => w[0]).join("").startsWith(q);
}
