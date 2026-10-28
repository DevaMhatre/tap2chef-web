import { normalizeName } from "./menu";
import { addPaise, paise, parseRupees, type Paise } from "./money";
import { err, ok, type Result } from "./result";

// The money arithmetic of a bill, free of orders: what is due, what is left,
// what to record and what change to hand back.

export type PaymentMethod = "cash" | "upi";
/** How one payment came in. A new method (card) is a new arm. */
export type Tender = { method: "cash" } | { method: "upi"; ref?: string };

/** Money knocked off the bill, typed as the final amount: "make it ₹850". */
export type Discount = { amount: Paise; /** "Regular". Empty when there is none. */ reason: string };

export const DISCOUNT_REASON_MAX = 80;

export const amountDue = (subtotal: Paise, discount?: Discount): Paise => paise(subtotal - (discount?.amount ?? 0));
export const amountPaid = (payments: readonly { amount: Paise }[]): Paise => addPaise(...payments.map((p) => p.amount));

export type DiscountError = "upward" | "belowPaid" | "tooLong";

/**
 * The owner types what the guest pays; the difference is the discount. Only
 * ever downward, and never below what has already been received.
 */
export function discountTo(
  subtotal: Paise,
  finalAmount: Paise,
  reason = "",
  paid: Paise = paise(0),
): Result<Discount | undefined, DiscountError> {
  if (finalAmount > subtotal) return err("upward");
  if (finalAmount < paid) return err("belowPaid");
  const why = normalizeName(reason);
  if (why.length > DISCOUNT_REASON_MAX) return err("tooLong");
  return ok(finalAmount === subtotal ? undefined : { amount: paise(subtotal - finalAmount), reason: why });
}

/** What a payment records, and the change to hand back. */
export type Receipt = { amount: Paise; change: Paise };
export type ReceiveError = "zero" | "moreThanDue";

/**
 * Cash may be more than what is left — a ₹1000 note for ₹660 records ₹660
 * and hands back ₹340. UPI is exact, so more than what is left is a typo.
 */
export function receiptFor(method: PaymentMethod, given: Paise, remaining: Paise): Result<Receipt, ReceiveError> {
  if (given <= 0) return err("zero");
  if (given <= remaining) return ok({ amount: given, change: paise(0) });
  if (method === "upi" || remaining <= 0) return err("moreThanDue");
  return ok({ amount: remaining, change: paise(given - remaining) });
}

/** The day's money by drawer: what the cash box should hold, what came by UPI. */
export type Takings = { total: Paise; cash: Paise; upi: Paise };

export function takings(payments: readonly ({ amount: Paise } & Tender)[]): Takings {
  const by = (method: PaymentMethod) => amountPaid(payments.filter((p) => p.method === method));
  return { total: amountPaid(payments), cash: by("cash"), upi: by("upi") };
}

// ---------------------------------------------------------------- the bill sheet

/** What staff have typed or chosen on the bill so far, as typed. */
export type BillInput = {
  /** "Guest pays": empty means the full bill. */
  finalAmount: string;
  reason: string;
  /** Nothing until staff choose: how the guest paid is a decision, never a default. */
  method: PaymentMethod | null;
  /** The amount handed over or sent. */
  received: string;
};

export type BillQuote = {
  subtotal: Paise;
  /** The subtotal less a valid discount; the full subtotal while the typed amount is wrong. */
  due: Paise;
  discount: Result<Discount | undefined, "invalid" | DiscountError>;
  paid: Paise;
  /** What is still to come. Below zero when more came in than is due. */
  remaining: number;
  /** What the next payment would record; null until a method is chosen. */
  receipt: Result<Receipt, "empty" | "invalid" | ReceiveError> | null;
  /** True when the next payment closes the bill. */
  settles: boolean;
};

/** Everything the bill sheet shows, worked out from what staff typed. */
export function quoteBill(subtotal: Paise, paid: Paise, input: BillInput): BillQuote {
  const final = input.finalAmount.trim() === "" ? subtotal : parseRupees(input.finalAmount);
  const discount = final === undefined ? err("invalid" as const) : discountTo(subtotal, final, input.reason, paid);
  const due = discount.ok ? amountDue(subtotal, discount.value) : subtotal;
  const remaining = due - paid;

  const given = parseRupees(input.received);
  const receipt =
    input.method === null
      ? null
      : input.received.trim() === ""
        ? err("empty" as const)
        : given === undefined
          ? err("invalid" as const)
          : receiptFor(input.method, given, paise(Math.max(0, remaining)));

  return {
    subtotal,
    due,
    discount,
    paid,
    remaining,
    receipt,
    settles: discount.ok && receipt !== null && receipt.ok && receipt.value.amount === remaining,
  };
}
