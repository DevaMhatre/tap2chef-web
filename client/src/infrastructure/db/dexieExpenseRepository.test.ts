import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import type { Expense, ExpenseId } from "../../domain/expense";
import { paise } from "../../domain/money";
import type { BusinessDate, LineId, Order, OrderId, OrderLine, Payment, PaymentId, RoundId } from "../../domain/order";
import type { ItemId, ProfileId } from "../../domain/menu";
import type { TableId } from "../../domain/tables";
import type { DaySnapshot, ExpenseSnapshot } from "../../usecases/ports";
import { db } from "./db";
import { dexieDayRepository } from "./dexieDayRepository";
import { dexieDrawerRepository } from "./dexieDrawerRepository";
import { dexieExpenseRepository } from "./dexieExpenseRepository";
import { dexieOrderRepository } from "./dexieOrderRepository";

const TODAY = "2026-10-29" as BusinessDate;
const YESTERDAY = "2026-10-28" as BusinessDate;
const expense = (id: string, day: BusinessDate, over: Partial<Expense> = {}): Expense => ({
  id: id as ExpenseId, amount: paise(34000), method: "cash", note: "Vegetables", businessDate: day, recordedAt: 100, ...over,
});

function expenses(since: BusinessDate, until: (s: ExpenseSnapshot) => boolean): Promise<ExpenseSnapshot> {
  return new Promise((resolve) => {
    const stop = dexieExpenseRepository.subscribe(since, (s) => {
      if (until(s)) {
        stop();
        resolve(s);
      }
    });
  });
}

function dayOf(day: BusinessDate, until: (s: DaySnapshot) => boolean): Promise<DaySnapshot> {
  return new Promise((resolve) => {
    const stop = dexieDayRepository.subscribe(day, (s) => {
      if (until(s)) {
        stop();
        resolve(s);
      }
    });
  });
}

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe("dexieExpenseRepository", () => {
  it("round-trips an expense with its outbox entry, and reads from a day on", async () => {
    const today = expense("e1", TODAY);
    const old = expense("e2", YESTERDAY);
    await dexieExpenseRepository.write([{ table: "expenses", op: "put", record: today }, { table: "expenses", op: "put", record: old }]);
    expect((await expenses(TODAY, (s) => s.expenses.length === 1)).expenses).toEqual([today]);
    expect((await expenses(YESTERDAY, (s) => s.expenses.length === 2)).expenses).toHaveLength(2);
    expect(await db.outbox.where("table").equals("expenses").count()).toBe(2);
  });

  it("keeps a removal visible and a deleted record gone", async () => {
    const removed = expense("e1", TODAY, { removedAt: 200 });
    await dexieExpenseRepository.write([{ table: "expenses", op: "put", record: removed }]);
    expect((await expenses(TODAY, (s) => s.expenses.length === 1)).expenses).toEqual([removed]);
    await dexieExpenseRepository.write([{ table: "expenses", op: "remove", record: removed }]);
    expect((await expenses(TODAY, (s) => s.expenses.length === 0)).expenses).toEqual([]);
  });

  it("counts an expense again once its removal is undone", async () => {
    const kept = expense("e1", TODAY);
    await dexieExpenseRepository.write([{ table: "expenses", op: "put", record: { ...kept, removedAt: 200 } }]);
    await dexieExpenseRepository.write([{ table: "expenses", op: "put", record: kept }]);
    expect((await expenses(TODAY, (s) => s.expenses.length === 1)).expenses).toEqual([kept]);
  });

  it("skips malformed records rather than trusting them", async () => {
    await db.expenses.put({ id: "bad", accountId: "t", shopId: "t", createdAt: 1, updatedAt: 1, deleted: false, amount: -5, method: "cash", note: "x", businessDate: TODAY, recordedAt: 1 });
    await dexieExpenseRepository.write([{ table: "expenses", op: "put", record: expense("ok", TODAY) }]);
    expect((await expenses(TODAY, (s) => s.expenses.length >= 1)).expenses.map((e) => e.id)).toEqual(["ok"]);
  });
});

describe("dexieDayRepository", () => {
  it("reads a day's orders with their lines, payments and expenses, even if paid on a later day", async () => {
    const order: Order = {
      id: "o1" as OrderId,
      channel: { type: "dineIn", tableId: "t1" as TableId },
      profileId: "dine" as ProfileId,
      businessDate: YESTERDAY,
      openedAt: 100,
      state: { status: "settled", billedAt: 150, settledAt: 99_999_999, subtotal: paise(4000) },
    };
    const line: OrderLine = {
      id: "l1" as LineId, orderId: order.id, itemId: "roti" as ItemId, name: "Roti", diet: "veg",
      unitPrice: paise(2000), quantity: 2, note: "", addedAt: 100, state: { status: "sent", roundId: "r" as RoundId, sentAt: 110 },
    };
    const payment: Payment = { id: "p1" as PaymentId, orderId: order.id, amount: paise(4000), receivedAt: 99_999_999, method: "upi" };
    await dexieOrderRepository.write([
      { table: "orders", op: "put", record: order },
      { table: "lines", op: "put", record: line },
      { table: "payments", op: "put", record: payment },
    ]);
    await dexieExpenseRepository.write([
      { table: "expenses", op: "put", record: expense("e1", YESTERDAY) },
      { table: "expenses", op: "put", record: expense("e2", TODAY) },
    ]);

    const yesterday = await dayOf(YESTERDAY, (s) => s.expenses.length === 1 && s.payments.length === 1);
    expect(yesterday).toMatchObject({ orders: [order], lines: [line], payments: [payment] });
    expect(yesterday.expenses.map((e) => e.id)).toEqual(["e1"]);

    const today = await dayOf(TODAY, (s) => s.expenses.length === 1);
    expect(today).toMatchObject({ orders: [], lines: [], payments: [] });
  });

  it("reads what the box held on the day and the day before, replacing a restated amount", async () => {
    const entry = (kind: "opening" | "counted", day: BusinessDate, amount: number) => ({ id: `${kind}@${day}`, kind, businessDate: day, amount: paise(amount) });
    await dexieDrawerRepository.write([
      { table: "drawer", op: "put", record: entry("counted", YESTERDAY, 80000) },
      { table: "drawer", op: "put", record: entry("opening", TODAY, 50000) },
      { table: "drawer", op: "put", record: entry("opening", TODAY, 60000) },
      { table: "drawer", op: "put", record: entry("counted", "2026-10-20" as BusinessDate, 1) },
    ]);
    const today = await dayOf(TODAY, (s) => s.drawer.length === 2);
    expect(today.drawer.map((d) => [d.id, d.amount]).sort()).toEqual([["counted@2026-10-28", 80000], ["opening@2026-10-29", 60000]]);
    expect(await db.outbox.where("table").equals("drawerEntries").count()).toBe(4);
  });
});
