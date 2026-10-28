import { NAME_MAX, type ItemDraftErrors, type MenuItem, type MenuProfile, type NameError, type PriceError } from "../../../domain/menu";
import { formatPrice } from "../../format";

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
    return pricing ? [{ profile, price: pricing.price }] : [];
  });
  if (sold.length === 0) return "Not on sale";

  const same = sold.every((s) => s.price === sold[0]!.price);
  const prices = same
    ? formatPrice(sold[0]!.price)
    : sold.map((s) => (named ? `${s.profile.name} ${formatPrice(s.price)}` : formatPrice(s.price))).join(" · ");
  if (sold.length === profiles.length) return prices;
  return `${prices} · ${sold.map((s) => s.profile.name).join(", ")} only`;
}
