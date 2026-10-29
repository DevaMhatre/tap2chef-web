import { describe, expect, it } from "vitest";
import {
  entryDays, expensesOn, noteExpense, noteSuggestions, readDraft, removeExpense, spentOn,
  type Expense, type ExpenseId, type ExpenseInput,
} from "./expense";
import { paise } from "./money";
import type { BusinessDate } from "./order";

const rupees = (r: number) => paise(r * 100);
const day = (d: string) => d as BusinessDate;
const today = day("2026-10-29");
const input = (over: Partial<ExpenseInput> = {}): ExpenseInput => ({ amount: rupees(340), method: "cash", note: "Vegetables", day: today, ...over });
const expense = (id: string, over: Partial<Expense> = {}): Expense => ({
  id: id as ExpenseId, amount: rupees(100), method: "cash", note: "Gas", businessDate: today, recordedAt: 1, ...over,
});

describe("noteExpense", () => {
  it("records a tidy expense on its day", () => {
    const r = noteExpense(input({ note: "  Vegetables  " }), "e1" as ExpenseId, today, 5);
    expect(r).toEqual({
      ok: true,
      value: { id: "e1", amount: rupees(340), method: "cash", note: "Vegetables", businessDate: today, recordedAt: 5 },
    });
  });

  it("allows yesterday, refuses tomorrow", () => {
    expect(noteExpense(input({ day: day("2026-10-28") }), "e" as ExpenseId, today, 1).ok).toBe(true);
    expect(noteExpense(input({ day: day("2026-10-30") }), "e" as ExpenseId, today, 1)).toEqual({ ok: false, error: "future" });
  });

  it("refuses ₹0, a missing note and a long one", () => {
    const id = "e" as ExpenseId;
    expect(noteExpense(input({ amount: paise(0) }), id, today, 1)).toEqual({ ok: false, error: "zero" });
    expect(noteExpense(input({ note: "  " }), id, today, 1)).toEqual({ ok: false, error: "noNote" });
    expect(noteExpense(input({ note: "x".repeat(81) }), id, today, 1)).toEqual({ ok: false, error: "tooLong" });
  });
});

describe("removing", () => {
  it("marks it removed, once", () => {
    const removed = removeExpense(expense("a"), 9);
    expect(removed).toMatchObject({ ok: true, value: { removedAt: 9 } });
    if (!removed.ok) throw new Error("expected ok");
    expect(removeExpense(removed.value, 10)).toEqual({ ok: false, error: "removed" });
  });
});

describe("spentOn", () => {
  it("adds the day by drawer, skipping removed and other days", () => {
    const list = [
      expense("a", { amount: rupees(340) }),
      expense("b", { amount: rupees(60), method: "upi" }),
      expense("c", { amount: rupees(500), removedAt: 3 }),
      expense("d", { amount: rupees(900), businessDate: day("2026-10-28") }),
    ];
    expect(spentOn(list, today)).toEqual({ total: rupees(400), cash: rupees(340), upi: rupees(60) });
    expect(spentOn([], today)).toEqual({ total: 0, cash: 0, upi: 0 });
  });
});

describe("expensesOn", () => {
  it("lists the day latest first, removed ones included", () => {
    const list = [expense("a", { recordedAt: 1 }), expense("b", { recordedAt: 3, removedAt: 4 }), expense("c", { businessDate: day("2026-10-28") })];
    expect(expensesOn(list, today).map((e) => e.id)).toEqual(["b", "a"]);
  });
});

describe("noteSuggestions", () => {
  it("offers the commonest notes first, ignoring case and removed ones", () => {
    const list = [
      expense("a", { note: "Gas", recordedAt: 1 }),
      expense("b", { note: "vegetables", recordedAt: 2 }),
      expense("c", { note: "Vegetables", recordedAt: 3 }),
      expense("d", { note: "Milk", recordedAt: 4 }),
      expense("e", { note: "Tea", recordedAt: 5, removedAt: 6 }),
    ];
    expect(noteSuggestions(list)).toEqual(["vegetables", "Milk", "Gas"]);
    expect(noteSuggestions(list, 1)).toEqual(["vegetables"]);
  });
});

describe("entryDays", () => {
  it("is today and the day before", () => {
    expect(entryDays(today)).toEqual([today, "2026-10-28"]);
  });
});

describe("readDraft", () => {
  const draft = { amount: "₹1,200.50", method: "upi" as const, note: "Gas", day: today };
  it("reads the typed amount strictly", () => {
    expect(readDraft(draft)).toEqual({ ok: true, value: { amount: 120050, method: "upi", note: "Gas", day: today } });
    expect(readDraft({ ...draft, amount: "12.505" })).toEqual({ ok: false, error: "badAmount" });
    expect(readDraft({ ...draft, amount: "" })).toEqual({ ok: false, error: "badAmount" });
    expect(readDraft({ ...draft, amount: "12abc" })).toEqual({ ok: false, error: "badAmount" });
  });
  it("needs a drawer chosen, and lets ₹0 through to the rules that refuse it", () => {
    expect(readDraft({ ...draft, method: null })).toEqual({ ok: false, error: "noMethod" });
    expect(readDraft({ ...draft, amount: "0" })).toMatchObject({ ok: true, value: { amount: 0 } });
  });
});
