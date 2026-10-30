import { NAME_MAX, validateName, validatePrice, type Diet, type NameError, type PriceError } from "./menu";
import type { Paise } from "./money";
import { err, ok, type Result } from "./result";

// A new owner's first minutes: four questions, each of which changes what
// they see today. Asked once per phone that starts empty; a phone that
// already has records never sees them.

/** How customers order here. No dine-in means no tables anywhere. */
export type Service = "dineIn" | "takeaway" | "both";

/** The two tiles, as chosen. */
export type ServiceChoice = { dineIn: boolean; takeaway: boolean };

export const choiceOf = (service: Service): ServiceChoice => ({ dineIn: service !== "takeaway", takeaway: service !== "dineIn" });

export function readService(choice: ServiceChoice): Result<Service, "none"> {
  if (choice.dineIn && choice.takeaway) return ok("both");
  if (choice.dineIn) return ok("dineIn");
  if (choice.takeaway) return ok("takeaway");
  return err("none");
}

export const servesDineIn = (service: Service): boolean => service !== "takeaway";

/**
 * Whether the app shows tables at all. A restaurant set up before this
 * question existed has no answer, and keeps what it always had.
 */
export const showsTables = (details: ShopDetails | null): boolean => (details ? servesDineIn(details.service) : true);

/**
 * Whether starting a takeaway is a main action. At a dine-in-only place it
 * stays, for the occasional parcel, but quietly.
 */
export const takeawayIsMain = (details: ShopDetails | null): boolean => details?.service !== "dineIn";

/** A takeaway-only kitchen's one price list is "Takeaway", never "Dine-In". */
export const firstPriceListName = (service: Service): string => (service === "takeaway" ? "Takeaway" : "Dine-In");

/** The restaurant as its owner described it. One per shop, on every phone of it. */
export type ShopDetails = { name: string; service: Service };

/**
 * Where this phone is in the setup. Kept on the phone only, and saved as each
 * answer is given, so an owner called away by a customer comes back to the
 * same question.
 */
export type SetupProgress =
  | { step: "account" }
  | { step: "name" }
  /** The name is kept here until the next answer, so both are written together. */
  | { step: "service"; name: string }
  | { step: "tables" }
  | { step: "menu" }
  | { step: "ready" }
  | { step: "done" };

/** After how customers order: tables, only if they sit down. */
export const stepAfterService = (service: Service): SetupProgress =>
  servesDineIn(service) ? { step: "tables" } : { step: "menu" };

// ---------------------------------------------------------------- the menu step

/**
 * A row on the starter list, as typed. Typing a price is what picks a dish:
 * an empty price means not on this menu. A starter dish comes with its name
 * and diet; the owner's own row brings them.
 */
export type DishRow = { key: string; category: string; price: string } & (
  | { kind: "starter"; name: string; diet: Diet }
  | { kind: "own"; name: string; diet: Diet | null }
);

export type NewDish = { category: string; name: string; diet: Diet; price: Paise };

export type DishRowError = { name?: NameError; diet?: "required"; price?: PriceError };

/** The rows the owner priced, or the errors by row key. A row left entirely blank is skipped. */
export function readDishRows(rows: readonly DishRow[]): Result<NewDish[], Record<string, DishRowError>> {
  const dishes: NewDish[] = [];
  const errors: Record<string, DishRowError> = {};
  for (const row of rows) {
    // An own dish with a name but no price is one they want: ask for its price.
    const wanted = row.kind === "own" && row.name.trim() !== "";
    if (row.price.trim() === "" && !wanted) continue;
    const price = validatePrice(row.price);
    const name = validateName(row.name, NAME_MAX.item);
    const error: DishRowError = {
      ...(name.ok ? {} : { name: name.error }),
      ...(row.diet ? {} : { diet: "required" as const }),
      ...(price.ok ? {} : { price: price.error }),
    };
    if (name.ok && price.ok && row.diet) dishes.push({ category: row.category, name: name.value, diet: row.diet, price: price.value });
    else errors[row.key] = error;
  }
  return Object.keys(errors).length > 0 ? err(errors) : ok(dishes);
}
