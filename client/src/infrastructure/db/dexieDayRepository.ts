import { liveQuery } from "dexie";
import { dayBefore, type BusinessDate } from "../../domain/order";
import type { DayRepository, DaySnapshot } from "../../usecases/ports";
import { db } from "./db";
import { toDrawerEntry } from "./dexieDrawerRepository";
import { toRepayment } from "./dexieDuesRepository";
import { toExpense } from "./dexieExpenseRepository";
import { toKotPrint, toLine, toOrder, toPayment, toTable } from "./dexieOrderRepository";
import { readAll } from "./parse";

// One trading day's records, whenever they were written: a bill opened
// yesterday and paid today is read under yesterday, because its order is.
async function readDay(day: BusinessDate): Promise<DaySnapshot> {
  const [orderRows, expenseRows, drawerRows, repaymentRows, kotRows, tableRows] = await Promise.all([
    db.orders.where("businessDate").equals(day).toArray(),
    db.expenses.where("businessDate").equals(day).toArray(),
    // The day before too: what it counted is what this day starts with.
    db.drawerEntries.where("businessDate").anyOf([day, dayBefore(day)]).toArray(),
    db.repayments.where("businessDate").equals(day).toArray(),
    db.kotPrints.where("businessDate").equals(day).toArray(),
    db.diningTables.toArray(),
  ]);
  // A KOT printed today for an order of an earlier day (left open past 4 am) is tallied with its order.
  const dayIds = new Set(orderRows.map((r) => r.id));
  const otherIds = [...new Set(kotRows.map((r) => r.orderId as string))].filter((id) => !dayIds.has(id));
  const others = otherIds.length > 0 ? await db.orders.where("id").anyOf(otherIds).toArray() : [];
  const orders = readAll([...orderRows, ...others], toOrder, "order");
  const ids = orders.map((o) => o.id);
  const [lines, payments] = await Promise.all([
    db.orderItems.where("orderId").anyOf(ids).toArray(),
    db.payments.where("orderId").anyOf(ids).toArray(),
  ]);
  return {
    orders,
    lines: readAll(lines, toLine, "line"),
    payments: readAll(payments, toPayment, "payment"),
    expenses: readAll(expenseRows, toExpense, "expense"),
    drawer: readAll(drawerRows, toDrawerEntry, "drawer"),
    repayments: readAll(repaymentRows, toRepayment, "repayment"),
    kotPrints: readAll(kotRows, toKotPrint, "kot"),
    tables: readAll(tableRows, toTable, "table"),
  };
}

export const dexieDayRepository: DayRepository = {
  subscribe(day, onChange) {
    const subscription = liveQuery(() => readDay(day)).subscribe({
      next: onChange,
      error: (error) => console.error("Day query failed", error),
    });
    return () => subscription.unsubscribe();
  },
};
