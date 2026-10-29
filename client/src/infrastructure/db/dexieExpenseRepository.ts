import { liveQuery } from "dexie";
import type { Expense, ExpenseId } from "../../domain/expense";
import type { Paise } from "../../domain/money";
import type { BusinessDate } from "../../domain/order";
import type { ExpenseChange, ExpenseRepository, ExpenseSnapshot } from "../../usecases/ports";
import { db, type StoredRecord } from "./db";
import { isPaise, isText, isTime, readAll } from "./parse";
import { writeAll } from "./repo";

// Anti-corruption layer between stored records and the expense domain.

const isDate = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

export function toExpense(r: StoredRecord): Expense | undefined {
  if (!isPaise(r.amount) || r.amount === 0 || (r.method !== "cash" && r.method !== "upi")) return undefined;
  if (!isText(r.note) || !isDate(r.businessDate) || !isTime(r.recordedAt)) return undefined;
  if (r.removedAt !== undefined && !isTime(r.removedAt)) return undefined;
  return {
    id: r.id as ExpenseId,
    amount: r.amount as Paise,
    method: r.method,
    note: r.note,
    businessDate: r.businessDate as BusinessDate,
    recordedAt: r.recordedAt,
    ...(r.removedAt !== undefined && { removedAt: r.removedAt }),
  };
}

async function readExpenses(since: BusinessDate): Promise<ExpenseSnapshot> {
  const rows = await db.expenses.where("businessDate").aboveOrEqual(since).toArray();
  return { expenses: readAll(rows, toExpense, "expense") };
}

export const dexieExpenseRepository: ExpenseRepository = {
  subscribe(since, onChange) {
    const subscription = liveQuery(() => readExpenses(since)).subscribe({
      next: onChange,
      error: (error) => console.error("Expense query failed", error),
    });
    return () => subscription.unsubscribe();
  },

  write: (changes: readonly ExpenseChange[]) =>
    writeAll(changes.map((c) => ({ table: "expenses" as const, record: c.record, op: c.op }))),
};
