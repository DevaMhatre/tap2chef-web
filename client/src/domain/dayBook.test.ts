import { describe, expect, it } from "vitest";
import { dayNumbers, isQuiet } from "./dayBook";
import type { Expense, ExpenseId } from "./expense";
import type { ItemId, ProfileId } from "./menu";
import { paise } from "./money";
import type { BusinessDate, LineId, Order, OrderId, OrderLine, OrderState, Payment, PaymentId, RoundId } from "./order";
import type { TableId } from "./tables";

const rupees = (r: number) => paise(r * 100);
const DAY = "2026-10-29" as BusinessDate;
const YESTERDAY = "2026-10-28" as BusinessDate;

const order = (id: string, state: OrderState, day = DAY): Order => ({
  id: id as OrderId,
  channel: { type: "dineIn", tableId: "t1" as TableId },
  profileId: "dine" as ProfileId,
  businessDate: day,
  openedAt: 1,
  state,
});
const settled = (price: number, discount?: number): OrderState => ({
  status: "settled",
  billedAt: 5,
  settledAt: 6,
  subtotal: rupees(price),
  ...(discount && { discount: { amount: rupees(discount), reason: "" } }),
});
const line = (orderId: string, name: string, price: number, quantity = 1, state: OrderLine["state"] = { status: "sent", roundId: "r" as RoundId, sentAt: 2 }): OrderLine => ({
  id: `${orderId}-${name}` as LineId,
  orderId: orderId as OrderId,
  itemId: name as ItemId,
  name,
  diet: "veg",
  unitPrice: rupees(price),
  quantity,
  note: "",
  addedAt: 1,
  state,
});
const pay = (id: string, orderId: string, method: "cash" | "upi", amount: number, extra: Partial<Payment> = {}): Payment =>
  ({ id: id as PaymentId, orderId: orderId as OrderId, amount: rupees(amount), receivedAt: 5, method, ...extra }) as Payment;
const spend = (id: string, method: "cash" | "upi", amount: number, day = DAY, extra: Partial<Expense> = {}): Expense => ({
  id: id as ExpenseId, amount: rupees(amount), method, note: "Gas", businessDate: day, recordedAt: 1, ...extra,
});

describe("dayNumbers", () => {
  it("is quiet on an empty day", () => {
    const n = dayNumbers(DAY, [], [], [], []);
    expect(isQuiet(n)).toBe(true);
    expect(n.sales).toEqual({ total: 0, cash: 0, upi: 0 });
    expect(n.top).toEqual([]);
  });

  it("adds money by drawer and takes spending off, cash against the drawer", () => {
    const orders = [order("a", settled(500)), order("b", settled(300))];
    const payments = [pay("p1", "a", "cash", 500), pay("p2", "b", "upi", 300)];
    const expenses = [spend("e1", "cash", 340), spend("e2", "upi", 60), spend("e3", "cash", 999, YESTERDAY), spend("e4", "cash", 70, DAY, { removedAt: 9 })];
    const n = dayNumbers(DAY, orders, [], payments, expenses);
    expect(n.sales).toEqual({ total: rupees(800), cash: rupees(500), upi: rupees(300) });
    expect(n.spent).toEqual({ total: rupees(400), cash: rupees(340), upi: rupees(60) });
    expect(n.left).toBe(rupees(400));
    expect(n.drawer).toBe(rupees(160));
    expect(n.settled).toBe(2);
    expect(isQuiet(n)).toBe(false);
  });

  it("can go below zero: more spent than taken", () => {
    const n = dayNumbers(DAY, [], [], [], [spend("e", "cash", 500)]);
    expect(n.left).toBe(-rupees(500));
    expect(n.drawer).toBe(-rupees(500));
  });

  it("counts a bill opened yesterday under yesterday, even if paid today", () => {
    const orders = [order("late", settled(200), YESTERDAY)];
    const payments = [pay("p", "late", "cash", 200, { receivedAt: 99 })];
    expect(dayNumbers(DAY, orders, [], payments, []).sales.total).toBe(0);
    expect(dayNumbers(YESTERDAY, orders, [], payments, []).sales.total).toBe(rupees(200));
  });

  it("counts part payments on a bill still open, and what is still owed", () => {
    const orders = [order("o", { status: "billed", billedAt: 4 }), order("empty", { status: "open" })];
    const lines = [line("o", "Dal", 300, 2)];
    const payments = [pay("p", "o", "cash", 200)];
    const n = dayNumbers(DAY, orders, lines, payments, []);
    expect(n.sales.cash).toBe(rupees(200));
    expect(n.unpaid).toEqual({ count: 1, amount: rupees(400) });
    expect(n.settled).toBe(0);
  });

  it("shows what honesty needs: cancelled, discounts, corrected and removed payments", () => {
    const orders = [order("a", settled(500, 40))];
    const lines = [
      line("a", "Dal", 250, 2),
      line("a", "Tea", 20, 3, { status: "voided", roundId: "r" as RoundId, sentAt: 2, voidedAt: 3 }),
    ];
    const payments = [
      pay("p1", "a", "upi", 460, { correctedAt: 7 }),
      pay("p2", "a", "cash", 460, { removedAt: 8 }),
    ];
    const n = dayNumbers(DAY, orders, lines, payments, []);
    expect(n.cancelled).toEqual({ dishes: 3, value: rupees(60) });
    expect(n.discounts).toEqual({ count: 1, amount: rupees(40) });
    expect(n.corrected).toBe(1);
    expect(n.removed).toEqual({ count: 1, amount: rupees(460) });
    expect(n.sales.total).toBe(rupees(460));
  });

  it("ranks what sold, sent dishes only, and keeps three", () => {
    const orders = [order("a", { status: "open" })];
    const lines = [
      line("a", "Roti", 10, 5),
      line("a", "Dal", 100, 3),
      line("a", "Tea", 20, 3),
      line("a", "Rice", 80, 1),
      line("a", "Draft", 80, 9, { status: "draft" }),
    ];
    expect(dayNumbers(DAY, orders, lines, [], []).top.map((d) => [d.name, d.quantity])).toEqual([
      ["Roti", 5],
      ["Dal", 3],
      ["Tea", 3],
    ]);
  });
});
