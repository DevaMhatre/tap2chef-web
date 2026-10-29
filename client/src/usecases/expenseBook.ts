import { businessDate, type BusinessDate } from "../domain/order";
import {
  expensesOn,
  noteExpense,
  readDraft,
  removeExpense,
  spentOn,
  type Expense,
  type DraftError,
  type ExpenseDraft,
  type ExpenseError,
  type ExpenseId,
  type Spending,
} from "../domain/expense";
import { err, ok, type Result } from "../domain/result";
import { applyChanges } from "./applyChanges";
import type { Undo } from "./menuEditor";
import type { Clock, ExpenseChange, ExpenseRepository, ExpenseSnapshot, IdGenerator } from "./ports";
import { createSerialWriter } from "./serialWriter";

/** How far back a mistake can still be put right, and where suggestions come from. */
export const EXPENSE_WINDOW_DAYS = 30;

export type NoteError = ExpenseError | DraftError;

/** What was saved, for the confirmation, and how to take it back. */
export type Noted = { expense: Expense; undo: Undo };

export type ExpenseCommands = {
  /** An id fixed when the entry sheet opens, so saving twice can't note it twice. */
  newId(): ExpenseId;
  note(id: ExpenseId, draft: ExpenseDraft): Promise<Result<Noted, NoteError>>;
  /** Stays listed, struck through, and stops counting. Undo puts it back. */
  remove(id: ExpenseId): Promise<Result<Undo, "removed" | "missing">>;
};

export type ExpenseBook = {
  subscribe(onChange: (snapshot: ExpenseSnapshot) => void): () => void;
  commands: ExpenseCommands;
  today(): BusinessDate;
};

export type ExpenseDay = { day: BusinessDate; expenses: Expense[]; spent: Spending };

/** Today first (always), then earlier days that have something noted. */
export function daysOf(expenses: readonly Expense[], today: BusinessDate): ExpenseDay[] {
  const days = [...new Set([today, ...expenses.map((e) => e.businessDate)])].sort().reverse();
  return days.map((day) => ({ day, expenses: expensesOn(expenses, day), spent: spentOn(expenses, day) }));
}

export function createExpenseBook(repository: ExpenseRepository, ids: IdGenerator, clock: Clock): ExpenseBook {
  const writer = createSerialWriter<ExpenseSnapshot, ExpenseChange>((changes) => repository.write(changes), applyChanges);
  const today = () => businessDate(clock.now());
  const put = (record: Expense): ExpenseChange => ({ table: "expenses", record, op: "put" });
  // Undoing a removal puts back what was there; undoing a note takes it away again.
  const undoRemoval = (before: Expense): Undo => () =>
    writer.run(`undo:remove:${before.id}`, () => ({ changes: [put(before)], result: undefined }));
  const undoNote = (record: Expense): Undo => () =>
    writer.run(`undo:note:${record.id}`, () => ({ changes: [{ table: "expenses", record, op: "remove" }], result: undefined }));

  const commands: ExpenseCommands = {
    newId: () => ids.newId() as ExpenseId,

    note: (id, draft) =>
      writer.run<Result<Noted, NoteError>>(`note:${id}`, (s) => {
        const known = s.expenses.find((e) => e.id === id);
        // Saved already (a double tap): the same answer, nothing written twice.
        if (known) return { changes: [], result: ok({ expense: known, undo: undoNote(known) }) };
        const input = readDraft(draft);
        if (!input.ok) return { changes: [], result: input };
        const made = noteExpense(input.value, id, today(), clock.now());
        if (!made.ok) return { changes: [], result: made };
        return { changes: [put(made.value)], result: ok({ expense: made.value, undo: undoNote(made.value) }) };
      }),

    remove: (id) =>
      writer.run<Result<Undo, "removed" | "missing">>(`remove:${id}`, (s) => {
        const expense = s.expenses.find((e) => e.id === id);
        if (!expense) return { changes: [], result: err("missing") };
        const removed = removeExpense(expense, clock.now());
        if (!removed.ok) return { changes: [], result: removed };
        return { changes: [put(removed.value)], result: ok(undoRemoval(expense)) };
      }),
  };

  return {
    // A subscription kept open past the day's start still holds the old
    // window; every rule filters by day, so that is harmless.
    subscribe: (onChange) =>
      repository.subscribe(businessDate(clock.now() - EXPENSE_WINDOW_DAYS * 86_400_000), (snapshot) => {
        writer.observe(snapshot);
        onChange(snapshot);
      }),
    commands,
    today,
  };
}
