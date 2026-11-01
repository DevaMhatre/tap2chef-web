import { mainPrice, samePricing, type HalfError, NAME_MAX, type ItemDraftErrors, type Pricing, type MenuItem, type MenuProfile, type NameError, type PriceError } from "../../../domain/menu";
import { formatPrice } from "../../format";

/** "₹220", or "Half ₹180 · Full ₹320". */
export function pricingText(pricing: Pricing): string {
  return pricing.kind === "fixed"
    ? formatPrice(pricing.price)
    : pricing.portions.map((p) => `${p.name} ${formatPrice(p.price)}`).join(" · ");
}

// The words the owner reads. Rules live in the domain; this file only says
// them in plain language.

export function nameMessage(error: NameError | undefined, max: number): string | undefined {
  if (error === "required") return "Enter a name";
  if (error === "tooLong") return `Keep it under ${max} characters`;
  return undefined;
}

const PRICE: Record<PriceError, string> = {
  required: "Enter a price",
  invalid: "Use a number like 120 or 120.50",
  tooHigh: "That looks too high — check the zeros",
};

export const priceMessage = (error: PriceError | undefined) => (error ? PRICE[error] : undefined);

export const halfMessage = (error: HalfError | undefined) =>
  error === "notLess" ? "Half should cost less than full" : error === "required" ? "Enter the half price" : priceMessage(error);

export function firstHalfMessage(errors: ItemDraftErrors): string | undefined {
  return halfMessage(Object.values(errors.halves ?? {})[0]);
}

/** One message for quick add, which has a single price field for every list. */
export function firstPriceMessage(errors: ItemDraftErrors): string | undefined {
  return priceMessage(Object.values(errors.prices ?? {})[0]);
}

export const itemNameMessage = (errors: ItemDraftErrors) => nameMessage(errors.name, NAME_MAX.item);
export const dietMessage = (errors: ItemDraftErrors) => (errors.diet ? "Veg, non-veg or egg?" : undefined);
export const categoryMessage = (errors: ItemDraftErrors) => (errors.category ? "Choose a category" : undefined);

/**
 * What a menu row shows on the right: "₹220" when every list charges the
 * same, "₹40 · ₹50" when they differ ("Dine-In ₹40 · Takeaway ₹50" with
 * `named`, where there's room), "₹220 · Dine-In only" when some lists don't
 * sell it.
 */
export function priceSummary(
  item: MenuItem,
  profiles: readonly MenuProfile[],
  { named = false }: { named?: boolean } = {},
): string {
  const sold = profiles.flatMap((profile) => {
    const pricing = item.prices[profile.id];
    return pricing ? [{ profile, pricing }] : [];
  });
  if (sold.length === 0) return "Not on sale";

  const same = sold.every((s) => samePricing(s.pricing, sold[0]!.pricing));
  const prices = same
    ? pricingText(sold[0]!.pricing)
    : sold.map((s) => (named ? `${s.profile.name} ${pricingText(s.pricing)}` : pricingText(s.pricing))).join(" · ");
  if (sold.length === profiles.length) return prices;
  return `${prices} · ${sold.map((s) => s.profile.name).join(", ")} only`;
}

/**
 * The phone row, where one line has no room for names: the first list's price
 * on the right, and a quiet second line only when something differs —
 * "Takeaway ₹50", "Dine-In only".
 */
export function compactPrices(item: MenuItem, profiles: readonly MenuProfile[]): { main: string; detail?: string } {
  const sold = profiles.flatMap((profile) => {
    const pricing = item.prices[profile.id];
    return pricing ? [{ profile, pricing }] : [];
  });
  const [first, ...rest] = sold;
  if (!first) return { main: "Not on sale" };

  // A half leads the second line: the full price is already on the right.
  const notes = first.pricing.kind === "portions" ? [pricingText({ ...first.pricing, portions: first.pricing.portions.slice(0, -1) })] : [];
  notes.push(...rest.filter((s) => !samePricing(s.pricing, first.pricing)).map((s) => `${s.profile.name} ${pricingText(s.pricing)}`));
  if (sold.length < profiles.length) notes.push(`${sold.map((s) => s.profile.name).join(", ")} only`);
  const main = formatPrice(mainPrice(first.pricing));
  return notes.length > 0 ? { main, detail: notes.join(" · ") } : { main };
}
