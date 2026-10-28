import type { VoidReason } from "../../../domain/order";
import type { PaymentMethod } from "../../../domain/settlement";
import type { OrderLabel } from "../../../usecases/useOrders";

// The words staff read. "4" becomes "Table 4"; a named table keeps its name.
export const tableTitle = (name: string): string => (/^\d+$/.test(name) ? `Table ${name}` : name);

/** The order screen's title: says what kind of order it is, not just its number. */
export const orderTitle = (label: OrderLabel): string =>
  label.kind === "table" ? tableTitle(label.name) : `Takeaway · Token ${label.token}`;

/** A row under a Dine-in or Takeaway heading, which already says the kind. */
export const shortOrderTitle = (label: OrderLabel): string =>
  label.kind === "table" ? tableTitle(label.name) : `Token ${label.token}`;

export const VOID_REASONS: { value: VoidReason; label: string }[] = [
  { value: "wrongEntry", label: "Wrong entry" },
  { value: "guestChangedMind", label: "Guest changed mind" },
  { value: "outOfStock", label: "Out of stock" },
];

export const voidReasonLabel = (reason: VoidReason): string => VOID_REASONS.find((r) => r.value === reason)!.label;

/** How a bill was paid, in a word or two. */
export function paidByLabel(payments: readonly { method: PaymentMethod }[]): string {
  const methods = new Set(payments.map((p) => p.method));
  if (methods.size === 0) return "Nothing to pay";
  if (methods.size > 1) return "Cash + UPI";
  return methods.has("cash") ? "Cash" : "UPI";
}

export const METHOD_LABEL: Record<PaymentMethod, string> = { cash: "Cash", upi: "UPI" };
