import { normalizeName, type Id } from "./menu";
import { addPaise, parseRupees, type Paise } from "./money";
import { dayBefore, type BusinessDate } from "./order";
import { err, ok, type Result } from "./result";
import type { PaymentMethod } from "./settlement";

export type ExpenseId = Id<"ExpenseId">;

/**
 * Money that went out: vegetables from the market, gas, a repair. A record of
 * its own, so two devices noting expenses at once both count.
 */
export type Expense = {
  id: ExpenseId;
  amount: Paise;
  method: PaymentMethod;
  /** What it was for, in the owner's words: "Vegetables". Never a category to set up. */
  note: string;
  /** The trading day it belongs to. Usually today; yesterday's gas can be noted late. */
  businessDate: BusinessDate;
  recordedAt: number;
  /** Taken off (a typo, noted twice); kept and shown, never counted. */
  removedAt?: number;
};

export const NOTE_MAX = 80;

/** An expense that counts towards the day. */
export const spent = (expense: Expense): boolean => expense.removedAt === undefined;

/** What staff have typed into the entry sheet, as typed. */
export type ExpenseDraft = { amount: string; method: PaymentMethod | null; note: string; day: BusinessDate };
export type DraftError = "badAmount" | "noMethod";

/** Reads the typed amount strictly ("12.505" is a typo, not ₹12.51) and needs a drawer chosen. */
export function readDraft(draft: ExpenseDraft): Result<ExpenseInput, DraftError> {
  const amount = parseRupees(draft.amount);
  if (amount === undefined) return err("badAmount");
  if (draft.method === null) return err("noMethod");
  return ok({ amount, method: draft.method, note: draft.note, day: draft.day });
}

export type ExpenseInput = { amount: Paise; method: PaymentMethod; note: string; day: BusinessDate };
export type ExpenseError = "zero" | "noNote" | "tooLong" | "future";

/** Checks what staff typed. A note is required: "₹340" alone means nothing at midnight. */
export function noteExpense(
  input: ExpenseInput,
  id: ExpenseId,
  today: BusinessDate,
  at: number,
): Result<Expense, ExpenseError> {
  const note = normalizeName(input.note);
  if (input.amount <= 0) return err("zero");
  if (note === "") return err("noNote");
  if (note.length > NOTE_MAX) return err("tooLong");
  if (input.day > today) return err("future");
  return ok({ id, amount: input.amount, method: input.method, note, businessDate: input.day, recordedAt: at });
}

export function removeExpense(expense: Expense, at: number): Result<Expense, "removed"> {
  return spent(expense) ? ok({ ...expense, removedAt: at }) : err("removed");
}

export type Spending = { total: Paise; cash: Paise; upi: Paise };

/** What went out on a trading day, by drawer. */
export function spentOn(expenses: readonly Expense[], day: BusinessDate): Spending {
  const mine = expenses.filter((e) => spent(e) && e.businessDate === day);
  const by = (method: PaymentMethod) => addPaise(...mine.filter((e) => e.method === method).map((e) => e.amount));
  return { total: addPaise(...mine.map((e) => e.amount)), cash: by("cash"), upi: by("upi") };
}

/** The day's expenses, latest first, removed ones included (struck through on screen). */
export function expensesOn(expenses: readonly Expense[], day: BusinessDate): Expense[] {
  return expenses
    .filter((e) => e.businessDate === day)
    .sort((a, b) => b.recordedAt - a.recordedAt || (a.id < b.id ? 1 : -1));
}

/**
 * One-tap notes learned from what was typed before: the commonest first,
 * then the most recent. Nothing to configure.
 */
export function noteSuggestions(expenses: readonly Expense[], limit = 6): string[] {
  const seen = new Map<string, { note: string; count: number; last: number }>();
  for (const e of expenses.filter(spent)) {
    const key = e.note.toLowerCase();
    const known = seen.get(key);
    seen.set(key, { note: known?.note ?? e.note, count: (known?.count ?? 0) + 1, last: Math.max(known?.last ?? 0, e.recordedAt) });
  }
  return [...seen.values()]
    .sort((a, b) => b.count - a.count || b.last - a.last || (a.note < b.note ? -1 : 1))
    .slice(0, limit)
    .map((s) => s.note);
}

/** The days the entry sheet offers: today and the day before. Older is a typo or a different job. */
export const entryDays = (today: BusinessDate): [BusinessDate, BusinessDate] => [today, dayBefore(today)];
