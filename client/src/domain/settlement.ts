import { normalizeName } from "./menu";
import { addPaise, paise, parseRupees, type Paise } from "./money";
import { err, ok, type Result } from "./result";

// How a bill is paid, free of orders: the arithmetic every settle screen,
// correction and day's total shares.

export type Payment = { method: "cash"; amount: Paise } | { method: "upi"; amount: Paise; ref?: string };
export type PaymentMethod = Payment["method"];

/** Money knocked off the bill, typed as the final amount: "make it ₹850". */
export type Discount = { amount: Paise; /** "Regular". Empty when there is none. */ reason: string };

export type Bill = {
  /** What the dishes came to when the bill settled; later menu edits never change it. */
  subtotal: Paise;
  discount?: Discount;
  /** Several, so one bill can be part cash, part UPI. Sum to the amount due, exactly. */
  payments: Payment[];
};

export const DISCOUNT_REASON_MAX = 80;

export const amountDue = (subtotal: Paise, discount?: Discount): Paise => paise(subtotal - (discount?.amount ?? 0));
export const amountPaid = (payments: readonly Payment[]): Paise => addPaise(...payments.map((p) => p.amount));

export type DiscountError = "upward" | "tooLong";

/**
 * The owner types what the guest pays; the difference is the discount. Only
 * ever downward: a bill is raised by adding a dish, not by typing a number.
 */
export function discountTo(subtotal: Paise, finalAmount: Paise, reason = ""): Result<Discount | undefined, DiscountError> {
  if (finalAmount > subtotal) return err("upward");
  const why = normalizeName(reason);
  if (why.length > DISCOUNT_REASON_MAX) return err("tooLong");
  return ok(finalAmount === subtotal ? undefined : { amount: paise(subtotal - finalAmount), reason: why });
}

export type BillError = "discountTooLarge" | "zeroPayment" | "notExact";

/** A bill settles only when its payments sum exactly to what is due. */
export function validateBill(bill: Bill): Result<Bill, BillError> {
  const { subtotal, discount, payments } = bill;
  if (discount && (discount.amount <= 0 || discount.amount > subtotal)) return err("discountTooLarge");
  // A ₹0 payment says nothing and would show as a third method on the day's numbers.
  if (payments.some((p) => p.amount <= 0)) return err("zeroPayment");
  if (amountPaid(payments) !== amountDue(subtotal, discount)) return err("notExact");
  return ok(bill);
}

/** One tap: all of it in cash, or all of it by UPI. Nothing to pay is no payment. */
export function fullPayment(method: PaymentMethod, due: Paise): Payment[] {
  return due > 0 ? [{ method, amount: due }] : [];
}

/**
 * Split: the cash typed, UPI the rest. The sum is exact by construction, so
 * a split can never be a paisa off.
 */
export function splitPayment(due: Paise, cash: Paise): Result<Payment[], "moreThanDue"> {
  if (cash > due) return err("moreThanDue");
  return ok([...fullPayment("cash", cash), ...fullPayment("upi", paise(due - cash))]);
}

// ---------------------------------------------------------------- change

const RUPEE = 100;
const NOTE_STEPS = [50, 100, 500, 1000, 2000].map((r) => r * RUPEE);
// ₹50 steps help small bills (₹360 → ₹400); on ₹1240 nobody hands over ₹1250.
const SMALL_BILL = 1000 * RUPEE;

/**
 * What a guest is likely to hand over for `due`: the next round amounts above
 * it, smallest first, at most three. ₹890 → ₹900 · ₹1000 · ₹2000.
 */
export function tenderOptions(due: Paise): Paise[] {
  if (due <= 0) return [];
  const steps = NOTE_STEPS.filter((step) => step > 50 * RUPEE || due < SMALL_BILL);
  const above = steps.map((step) => (Math.floor(due / step) + 1) * step);
  return [...new Set(above)].sort((a, b) => a - b).slice(0, 3).map(paise);
}

/** The change to hand back, or nothing when the guest gave too little. */
export function changeFor(due: Paise, tendered: Paise): Paise | undefined {
  return tendered >= due ? paise(tendered - due) : undefined;
}

// ---------------------------------------------------------------- the bill sheet

/** What staff have typed or tapped on the bill so far, as typed. */
export type BillInput = {
  /** "Guest pays": empty means the full bill. */
  finalAmount: string;
  reason: string;
  /** The cash part of a split; UPI is the rest. */
  cash: string;
  /** A note the guest handed over, tapped from the change chips. */
  given?: Paise;
};

export type BillQuote = {
  subtotal: Paise;
  /** The subtotal less a valid discount; the full subtotal while the typed amount is wrong. */
  due: Paise;
  discount: Result<Discount | undefined, "invalid" | DiscountError>;
  /** The round amounts a guest is likely to hand over for `due`. */
  tender: Paise[];
  /** The change for `given`, when it covers `due`. */
  change?: Paise;
  /** Cash as typed and UPI the rest; empty cash is not a split yet. */
  split: Result<Payment[], "empty" | "invalid" | "moreThanDue">;
};

/** Everything the bill sheet shows, worked out from what staff typed. */
export function quoteBill(subtotal: Paise, input: BillInput): BillQuote {
  const final = input.finalAmount.trim() === "" ? subtotal : parseRupees(input.finalAmount);
  const discount = final === undefined ? err("invalid" as const) : discountTo(subtotal, final, input.reason);
  const due = discount.ok ? amountDue(subtotal, discount.value) : subtotal;

  const cash = parseRupees(input.cash);
  const split =
    input.cash.trim() === "" ? err("empty" as const) : cash === undefined ? err("invalid" as const) : splitPayment(due, cash);

  return {
    subtotal,
    due,
    discount,
    tender: tenderOptions(due),
    change: input.given === undefined ? undefined : changeFor(due, input.given),
    split,
  };
}
