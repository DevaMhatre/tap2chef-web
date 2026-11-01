import { normalizeName, type Id } from "./menu";
import { addPaise, paise, type Paise } from "./money";
import { businessDate, counts, type BusinessDate, type OrderId, type Payment } from "./order";
import { err, ok, type Result } from "./result";
import { receiptFor, type PaymentMethod, type ReceiveError } from "./settlement";

// "Put it on my name." A regular's bills go on their name (a `later` payment
// on the bill) and come back as money another day, all at once or in parts.
// There is no customer record: their mobile number is the account, so two
// phones writing it offline add to the same one and nothing can overwrite
// anything, and two regulars called Ravi stay two people.

export type RepaymentId = Id<"RepaymentId">;

/**
 * Money a regular brought back. A record of its own, never a field on the
 * bills: it counts in the drawer on the day it came, not the day they ate.
 */
export type Repayment = {
  id: RepaymentId;
  customer: string;
  /** Ten digits: who paid back. */
  phone: string;
  amount: Paise;
  method: PaymentMethod;
  receivedAt: number;
  businessDate: BusinessDate;
  by?: string;
};

/** Two names match however they were typed: "Sharma ji", "sharma  JI". */
export const nameKey = (name: string): string => normalizeName(name).toLowerCase();

/** A regular as the bill sheet offers them: the name last written for their number. */
export type Regular = { name: string; phone: string };

/** One bill (or the part of it) a regular took on their name. */
export type LaterBill = { paymentId: Payment["id"]; orderId: OrderId; amount: Paise; at: number };

export type Due = {
  /** As last written for their number: a corrected spelling wins. */
  customer: string;
  phone: string;
  /** What they still owe; below zero if two phones both took the money back. */
  owed: number;
  /** When the oldest bill not yet paid back was taken, oldest money first. */
  since?: number;
  bills: LaterBill[];
  repayments: Repayment[];
};

type LaterPayment = Payment & { method: "later" };
const isLater = (p: Payment): p is LaterPayment => p.method === "later" && counts(p);

/** Everyone who owes something (or was paid back twice), longest waiting first. */
export function duesOf(payments: readonly Payment[], repayments: readonly Repayment[]): Due[] {
  const by = new Map<string, { customer: string; phone: string; latest: number; bills: LaterBill[]; repayments: Repayment[] }>();
  const entry = (name: string, phone: string, at: number) => {
    const known = by.get(phone) ?? { customer: name, phone, latest: -Infinity, bills: [], repayments: [] };
    if (at >= known.latest) Object.assign(known, { customer: name, latest: at });
    by.set(phone, known);
    return known;
  };
  for (const p of payments.filter(isLater)) {
    entry(p.customer, p.phone, p.receivedAt).bills.push({ paymentId: p.id, orderId: p.orderId, amount: p.amount, at: p.receivedAt });
  }
  for (const r of repayments) entry(r.customer, r.phone, r.receivedAt).repayments.push(r);

  return [...by.values()]
    .map(({ customer, phone, bills, repayments: back }): Due => {
      bills.sort((a, b) => a.at - b.at || (a.paymentId < b.paymentId ? -1 : 1));
      back.sort((a, b) => a.receivedAt - b.receivedAt || (a.id < b.id ? -1 : 1));
      const repaid = addPaise(...back.map((r) => r.amount));
      const owed = addPaise(...bills.map((b) => b.amount)) - repaid;
      // Money back pays the oldest bills first.
      let left: number = repaid;
      const since = bills.find((b) => (left -= b.amount) < 0)?.at;
      return { customer, phone, owed, ...(since !== undefined && { since }), bills, repayments: back };
    })
    .filter((d) => d.owed !== 0)
    .sort((a, b) => (a.since ?? Infinity) - (b.since ?? Infinity) || (a.customer < b.customer ? -1 : 1));
}

export const totalOwed = (dues: readonly Due[]): Paise => paise(dues.reduce((n, d) => n + Math.max(0, d.owed), 0));

/** Regulars already used, most recent first, for one-tap choice on the bill. */
export function knownCustomers(payments: readonly Payment[], repayments: readonly Repayment[], limit = 6): Regular[] {
  const seen = new Map<string, Regular & { at: number }>();
  const note = (name: string, phone: string, at: number) => {
    const known = seen.get(phone);
    if (!known || at >= known.at) seen.set(phone, { name, phone, at });
  };
  for (const p of payments.filter(isLater)) note(p.customer, p.phone, p.receivedAt);
  for (const r of repayments) note(r.customer, r.phone, r.receivedAt);
  return [...seen.values()]
    .sort((a, b) => b.at - a.at)
    .slice(0, limit)
    .map(({ name, phone }) => ({ name, phone }));
}

/** What the regular with this number owes now. Zero for a new one. */
export function owedBy(dues: readonly Due[], phone: string): number {
  return dues.find((d) => d.phone === phone)?.owed ?? 0;
}

/**
 * A regular paying back. Cash may be more than they owe (change goes back);
 * UPI is exact. Planned against what they owe on the stored records.
 */
export function receiveRepayment(
  due: Due | undefined,
  method: PaymentMethod,
  given: Paise,
  newId: RepaymentId,
  at: number,
  by?: string,
): Result<{ repayment: Repayment; change: Paise }, ReceiveError | "nothingOwed"> {
  if (!due || due.owed <= 0) return err("nothingOwed");
  const receipt = receiptFor(method, given, paise(due.owed));
  if (!receipt.ok) return receipt;
  const repayment: Repayment = {
    id: newId,
    customer: due.customer,
    phone: due.phone,
    amount: receipt.value.amount,
    method,
    receivedAt: at,
    businessDate: businessDate(at),
    ...(by !== undefined && { by }),
  };
  return ok({ repayment, change: receipt.value.change });
}

/** Paid back on a trading day, by drawer: cash counts in that day's drawer. */
export function repaidOn(repayments: readonly Repayment[], day: BusinessDate): { total: Paise; cash: Paise; upi: Paise } {
  const mine = repayments.filter((r) => r.businessDate === day);
  const by = (method: PaymentMethod) => addPaise(...mine.filter((r) => r.method === method).map((r) => r.amount));
  return { total: addPaise(...mine.map((r) => r.amount)), cash: by("cash"), upi: by("upi") };
}
