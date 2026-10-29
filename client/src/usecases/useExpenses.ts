import { useEffect, useMemo, useState } from "react";
import { entryDays, noteSuggestions, type ExpenseDraft, type ExpenseId } from "../domain/expense";
import type { BusinessDate } from "../domain/order";
import type { Result } from "../domain/result";
import { createExpenseBook, daysOf, type ExpenseDay, type NoteError, type Noted } from "./expenseBook";
import type { Undo } from "./menuEditor";
import type { ExpenseSnapshot } from "./ports";
import { usePorts } from "./PortsProvider";

export type Expenses =
  | { state: "loading" }
  | {
      state: "ready";
      today: BusinessDate;
      /** Today first, then earlier days with something noted. */
      days: ExpenseDay[];
      /** Today and the day before: the days a new expense can be put on. */
      entryDays: [BusinessDate, BusinessDate];
      /** One-tap notes learned from earlier ones. */
      suggestions: string[];
      newId(): ExpenseId;
      note(id: ExpenseId, draft: ExpenseDraft): Promise<Result<Noted, NoteError>>;
      remove(id: ExpenseId): Promise<Result<Undo, "removed" | "missing">>;
    };

export type ReadyExpenses = Extract<Expenses, { state: "ready" }>;

export function useExpenses(): Expenses {
  const { expenses: repository, ids, clock } = usePorts();
  const book = useMemo(() => createExpenseBook(repository, ids, clock), [repository, ids, clock]);
  const [snapshot, setSnapshot] = useState<ExpenseSnapshot | null>(null);
  useEffect(() => book.subscribe(setSnapshot), [book]);
  if (!snapshot) return { state: "loading" };

  const today = book.today();
  return {
    state: "ready",
    today,
    days: daysOf(snapshot.expenses, today),
    entryDays: entryDays(today),
    suggestions: noteSuggestions(snapshot.expenses),
    ...book.commands,
  };
}
