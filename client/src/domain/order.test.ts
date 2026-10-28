import { describe, expect, it } from "vitest";
import type { CategoryId, ItemId, MenuItem, MenuProfile, OrderableItem, ProfileId } from "./menu";
import { paise } from "./money";
import {
  activeOrderAt,
  activeOrders,
  addToDraft,
  billOf,
  businessDate,
  canRemove,
  closeBill,
  correctPayment,
  dayBefore,
  defaultProfile,
  floorOf,
  nextToken,
  orderTotal,
  outOfStockId,
  outOn,
  presentBill,
  receivePayment,
  removePayment,
  reopenForDishes,
  sendDraft,
  settledOn,
  ticketOf,
  voidSent,
  withNote,
  withQuantity,
  type BusinessDate,
  type LineId,
  type Order,
  type OrderId,
  type OrderLine,
  type Payment,
  type PaymentId,
  type RoundId,
} from "./order";
import type { Discount } from "./settlement";
import type { DiningTable, TableId } from "./tables";

const DAY = "2026-10-29" as BusinessDate;
const dineIn = "dine-in" as ProfileId;

const dish = (id: string, price: number): OrderableItem => {
  const item: MenuItem = {
    id: id as ItemId,
    name: id,
    categoryId: "mains" as CategoryId,
    diet: "veg",
    sortKey: "1",
    prices: { [dineIn]: { kind: "fixed", price: paise(price) } },
  };
  return { item, pricing: { kind: "fixed", price: paise(price) } };
};
const roti = dish("Roti", 2000);
const paneer = dish("Paneer Tikka", 24000);

const order = (id: string, overrides: Partial<Order> = {}): Order => ({
  id: id as OrderId,
  channel: { type: "dineIn", tableId: "t4" as TableId },
  profileId: dineIn,
  businessDate: DAY,
  openedAt: 1,
  state: { status: "open" },
  ...overrides,
});

const draftLine = (id: string, item: OrderableItem, quantity = 1, orderId = "o1"): OrderLine => ({
  ...addToDraft([], orderId as OrderId, item, id as LineId, 1),
  quantity,
});

const sent = (line: OrderLine, round: string, at: number): OrderLine => sendDraft([line], round as RoundId, at)[0]!;

describe("businessDate", () => {
  it("keeps a dinner past midnight on the evening it started", () => {
    expect(businessDate(new Date(2026, 9, 29, 23, 30).getTime())).toBe("2026-10-29");
    expect(businessDate(new Date(2026, 9, 30, 1, 15).getTime())).toBe("2026-10-29");
    expect(businessDate(new Date(2026, 9, 30, 4, 0).getTime())).toBe("2026-10-30");
  });

  it("steps back across months and years", () => {
    expect(dayBefore("2026-11-01" as BusinessDate)).toBe("2026-10-31");
    expect(dayBefore("2027-01-01" as BusinessDate)).toBe("2026-12-31");
  });
});

describe("addToDraft", () => {
  it("snapshots name and price, and a second tap adds one more", () => {
    const first = addToDraft([], "o1" as OrderId, roti, "l1" as LineId, 5);
    expect(first).toMatchObject({ name: "Roti", unitPrice: 2000, quantity: 1, note: "", state: { status: "draft" } });
    expect(addToDraft([first], "o1" as OrderId, roti, "l2" as LineId, 6)).toMatchObject({ id: "l1", quantity: 2 });
  });

  it("starts a new line for a dish already sent, or one with a note", () => {
    const withSpice = { ...draftLine("l1", roti), note: "butter" };
    expect(addToDraft([withSpice], "o1" as OrderId, roti, "l2" as LineId, 2).id).toBe("l2");
    expect(addToDraft([sent(draftLine("l1", roti), "r1", 3)], "o1" as OrderId, roti, "l2" as LineId, 4).id).toBe("l2");
  });

  it("never goes past 99", () => {
    expect(addToDraft([draftLine("l1", roti, 99)], "o1" as OrderId, roti, "l2" as LineId, 2).quantity).toBe(99);
  });

  it("adds a ₹0 dish", () => {
    expect(addToDraft([], "o1" as OrderId, dish("Water", 0), "l1" as LineId, 1).unitPrice).toBe(0);
  });
});

describe("editing lines", () => {
  it("changes only lines still in the cart", () => {
    expect(withQuantity(draftLine("l1", roti), 3)).toMatchObject({ ok: true, value: { quantity: 3 } });
    expect(withQuantity(sent(draftLine("l1", roti), "r1", 2), 3)).toEqual({ ok: false, error: "notDraft" });
  });

  it("rejects 0, fractions and more than 99 — removing is its own command", () => {
    for (const q of [0, 1.5, 100, -1]) {
      expect(withQuantity(draftLine("l1", roti), q)).toEqual({ ok: false, error: "outOfRange" });
    }
  });

  it("tidies notes and caps their length", () => {
    expect(withNote(draftLine("l1", roti), "  less   spicy ")).toMatchObject({ ok: true, value: { note: "less spicy" } });
    expect(withNote(draftLine("l1", roti), "x".repeat(81))).toEqual({ ok: false, error: "tooLong" });
  });
});

describe("voidSent", () => {
  const sentRotis = sent(draftLine("l1", roti, 3), "r1", 10);

  it("voids a whole line and keeps it", () => {
    const result = voidSent(sentRotis, 3, "wrongEntry", "l2" as LineId, 20);
    expect(result).toMatchObject({ ok: true, value: [{ id: "l1", state: { status: "voided", reason: "wrongEntry", roundId: "r1" } }] });
  });

  it("splits a line when part of it is cancelled", () => {
    const result = voidSent(sentRotis, 1, undefined, "l2" as LineId, 20);
    expect(result.ok && result.value).toMatchObject([
      { id: "l1", quantity: 2, state: { status: "sent" } },
      { id: "l2", quantity: 1, state: { status: "voided", voidedAt: 20 } },
    ]);
    expect(result.ok && orderTotal(result.value)).toBe(4000);
  });

  it("refuses drafts and impossible quantities", () => {
    expect(voidSent(draftLine("l1", roti), 1, undefined, "l2" as LineId, 1)).toEqual({ ok: false, error: "notSent" });
    expect(voidSent(sentRotis, 4, undefined, "l2" as LineId, 1)).toEqual({ ok: false, error: "outOfRange" });
    expect(voidSent(sentRotis, 0, undefined, "l2" as LineId, 1)).toEqual({ ok: false, error: "outOfRange" });
  });
});

describe("the bill", () => {
  const sentLines = [sent(draftLine("l1", roti, 2), "r1", 10), sent(draftLine("l2", paneer), "r1", 10)]; // ₹280
  const billed = (): Order => {
    const result = presentBill(order("o1"), sentLines, 20);
    if (!result.ok) throw new Error(result.error);
    return result.value;
  };
  const pay = (o: Order, payments: Payment[], amount: number, id: string, method: "cash" | "upi" = "upi", discount?: Discount) =>
    receivePayment(o, sentLines, payments, discount, { method }, paise(amount), id as PaymentId, 30);

  it("is presented once everything is sent, and keeps the table", () => {
    expect(billed().state).toEqual({ status: "billed", billedAt: 20 });
    expect(presentBill(billed(), sentLines, 99)).toEqual({ ok: true, value: billed() });
    expect(presentBill(order("o1"), [...sentLines, draftLine("l3", roti)], 20)).toEqual({ ok: false, error: "unsent" });
    expect(presentBill(order("o1"), [], 20)).toEqual({ ok: false, error: "empty" });
    expect(activeOrders([billed()], sentLines)).toHaveLength(1);
  });

  it("takes money in parts and settles on the payment that leaves nothing", () => {
    const first = pay(billed(), [], 10000, "p1");
    if (!first.ok) throw new Error(first.error);
    expect(first.value.order.state.status).toBe("billed");
    expect(first.value.payment).toEqual({ id: "p1", orderId: "o1", amount: 10000, receivedAt: 30, method: "upi" });
    expect(billOf(first.value.order, sentLines, [first.value.payment])).toMatchObject({ due: 28000, paid: 10000, remaining: 18000 });

    const last = pay(first.value.order, [first.value.payment], 18000, "p2", "cash");
    expect(last.ok && last.value.order.state).toEqual({ status: "settled", billedAt: 20, settledAt: 30, subtotal: 28000 });
    expect(last.ok && activeOrders([last.value.order], sentLines, [first.value.payment, last.value.payment])).toEqual([]);
  });

  it("settles to the discounted amount and keeps the discount", () => {
    const discount = { amount: paise(3000), reason: "Regular" };
    const result = pay(billed(), [], 25000, "p1", "cash", discount);
    expect(result.ok && result.value.order.state).toMatchObject({ status: "settled", subtotal: 28000, discount });
    expect(pay(billed(), [], 25000, "p1", "cash", { amount: paise(28001), reason: "" })).toEqual({ ok: false, error: "discount" });
  });

  it("refuses more than is left, nothing, and money for an unbilled or settled order", () => {
    expect(pay(billed(), [], 28001, "p1")).toEqual({ ok: false, error: "moreThanDue" });
    expect(pay(billed(), [], 0, "p1")).toEqual({ ok: false, error: "zero" });
    expect(pay(order("o1"), [], 100, "p1")).toEqual({ ok: false, error: "notBilled" });
    const settledOrder = pay(billed(), [], 28000, "p1");
    expect(settledOrder.ok && pay(settledOrder.value.order, [], 100, "p2")).toEqual({ ok: false, error: "notBilled" });
  });

  it("stops when two devices took the same bill, and shows it", () => {
    const twice: Payment[] = ["a", "b"].map((id) => ({ id: id as PaymentId, orderId: "o1" as OrderId, amount: paise(28000), receivedAt: 30, method: "cash" }));
    expect(billOf(billed(), sentLines, twice).remaining).toBe(-28000);
    expect(pay(billed(), twice, 100, "p3")).toEqual({ ok: false, error: "overpaid" });
    expect(activeOrders([billed()], sentLines, twice)).toHaveLength(1);
  });

  it("closes a bill with nothing to pay", () => {
    const water = [sent(draftLine("w", dish("Water", 0)), "r1", 1)];
    const presented = presentBill(order("o1"), water, 5);
    expect(presented.ok && closeBill(presented.value, water, [], undefined, 9)).toMatchObject({ ok: true, value: { state: { status: "settled" } } });
    expect(closeBill(billed(), sentLines, [], { amount: paise(28000), reason: "On the house" }, 9).ok).toBe(true);
    expect(closeBill(billed(), sentLines, [], undefined, 9)).toEqual({ ok: false, error: "unpaid" });
  });

  it("goes back to open when a dish is added, dropping the discount", () => {
    expect(reopenForDishes({ ...billed(), state: { status: "billed", billedAt: 20, discount: { amount: paise(100), reason: "" } } }).state).toEqual({
      status: "open",
    });
  });

  it("keeps a settled bill's snapshot, whatever happens to the lines", () => {
    const result = pay(billed(), [], 28000, "p1");
    if (!result.ok) throw new Error(result.error);
    expect(billOf(result.value.order, [], [result.value.payment])).toMatchObject({ subtotal: 28000, remaining: 0 });
  });
});

describe("correctPayment", () => {
  const payment: Payment = { id: "p1" as PaymentId, orderId: "o1" as OrderId, amount: paise(500), receivedAt: 3, method: "cash" };

  it("changes the method, keeps the amount, and leaves a mark", () => {
    expect(correctPayment(payment, "upi", 9)).toEqual({ ok: true, value: { ...payment, method: "upi", correctedAt: 9 } });
    expect(correctPayment(payment, "cash", 9)).toEqual({ ok: false, error: "unchanged" });
  });
});

describe("removePayment", () => {
  const lines = [sent(draftLine("l1", paneer), "r1", 10)]; // ₹240
  const pay = (id: string, amount: number): Payment => ({
    id: id as PaymentId,
    orderId: "o1" as OrderId,
    amount: paise(amount),
    receivedAt: 3,
    method: "upi",
  });
  const billed: Order = { ...order("o1"), state: { status: "billed", billedAt: 2 } };
  const settledOrder: Order = { ...order("o1"), state: { status: "settled", billedAt: 2, settledAt: 4, subtotal: paise(24000) } };

  it("takes any payment off an unpaid bill, and it stops counting but stays listed", () => {
    const removed = removePayment(pay("a", 10000), billed, lines, [pay("a", 10000)], 9);
    expect(removed).toEqual({ ok: true, value: { ...pay("a", 10000), removedAt: 9 } });
    const bill = billOf(billed, lines, [removed.ok ? removed.value : pay("x", 1)]);
    expect(bill).toMatchObject({ paid: 0, remaining: 24000 });
    expect(bill.payments).toHaveLength(1);
    expect(removePayment({ ...pay("a", 10000), removedAt: 9 }, billed, lines, [], 10)).toEqual({ ok: false, error: "removed" });
  });

  it("on a settled bill, takes off only an excess, so it stays exact", () => {
    const twice = [pay("a", 24000), pay("b", 24000)];
    expect(billOf(settledOrder, lines, twice).remaining).toBe(-24000);
    expect(canRemove(twice[1]!, settledOrder, billOf(settledOrder, lines, twice))).toBe(true);
    expect(removePayment(twice[1]!, settledOrder, lines, twice, 9).ok).toBe(true);

    const once = [pay("a", 24000)];
    expect(canRemove(once[0]!, settledOrder, billOf(settledOrder, lines, once))).toBe(false);
    expect(removePayment(once[0]!, settledOrder, lines, once, 9)).toEqual({ ok: false, error: "leavesShort" });
  });

  it("can't correct a removed payment", () => {
    expect(correctPayment({ ...pay("a", 100), removedAt: 5 }, "cash", 9)).toEqual({ ok: false, error: "removed" });
  });
});

describe("settledOn", () => {
  const paid = (id: string, at: number, day = DAY): Order => ({
    ...order(id, { businessDate: day }),
    state: { status: "settled", billedAt: at, settledAt: at, subtotal: paise(2000) },
  });

  it("lists the day's paid bills, latest first, and nothing open or from another day", () => {
    const orders = [paid("a", 10), paid("b", 30), order("open"), paid("old", 20, "2026-10-28" as BusinessDate)];
    expect(settledOn(orders, DAY).map((o) => o.id)).toEqual(["b", "a"]);
  });
});

describe("ticketOf", () => {
  it("numbers rounds in send order and leaves drafts apart", () => {
    const lines = [
      draftLine("l3", roti),
      sent(draftLine("l2", paneer), "rB", 200),
      sent(draftLine("l1", roti, 2), "rA", 100),
    ];
    const ticket = ticketOf(lines);
    expect(ticket.rounds.map((r) => [r.id, r.number])).toEqual([
      ["rA", 1],
      ["rB", 2],
    ]);
    expect(ticket.draft.map((l) => l.id)).toEqual(["l3"]);
    expect(ticket.total).toBe(2000 * 2 + 24000 + 2000);
    expect(ticket.lastSentAt).toBe(200);
  });

  it("doesn't charge for cancelled dishes", () => {
    const voided = voidSent(sent(draftLine("l1", paneer), "r1", 1), 1, "outOfStock", "x" as LineId, 2);
    expect(voided.ok && ticketOf(voided.value).total).toBe(0);
  });
});

describe("open orders and the floor", () => {
  const t4: DiningTable = { id: "t4" as TableId, name: "4", sortKey: "2" };
  const t1: DiningTable = { id: "t1" as TableId, name: "1", sortKey: "1" };

  it("frees a table whose every line was cancelled", () => {
    const voided = voidSent(sent(draftLine("l1", roti), "r1", 1), 1, undefined, "x" as LineId, 2);
    const active = activeOrders([order("o1")], voided.ok ? voided.value : []);
    expect(active).toEqual([]);
    expect(floorOf([t4, t1], active).map((v) => [v.table.name, v.active])).toEqual([
      ["1", undefined],
      ["4", undefined],
    ]);
  });

  it("ignores an order with nothing on it", () => {
    expect(activeOrders([order("o1")], [])).toEqual([]);
  });

  it("picks the earliest when two devices opened the same table", () => {
    const active = activeOrders(
      [order("late", { openedAt: 50 }), order("early", { openedAt: 10 })],
      [draftLine("a", roti, 1, "late"), draftLine("b", roti, 1, "early")],
    );
    expect(activeOrderAt(t4.id, active)?.order.id).toBe("early");
  });
});

describe("nextToken", () => {
  const takeaway = (id: string, token: number, day = DAY) =>
    order(id, { channel: { type: "takeaway", token }, businessDate: day });

  it("counts up within the day and starts again tomorrow", () => {
    expect(nextToken([], DAY)).toBe(1);
    expect(nextToken([takeaway("a", 1), takeaway("b", 4), order("c")], DAY)).toBe(5);
    expect(nextToken([takeaway("a", 9, "2026-10-28" as BusinessDate)], DAY)).toBe(1);
  });
});

describe("defaultProfile", () => {
  const list = (...names: string[]): MenuProfile[] =>
    names.map((name, i) => ({ id: name as ProfileId, name, sortKey: `${i + 1}` }));

  it("finds the list named for the channel, else the first", () => {
    expect(defaultProfile("takeaway", list("Dine-In", "Takeaway"))).toBe("Takeaway");
    expect(defaultProfile("takeaway", list("Dine-In", "Parcel"))).toBe("Parcel");
    expect(defaultProfile("dineIn", list("Takeaway", "Dine In"))).toBe("Dine In");
    expect(defaultProfile("takeaway", list("Regular", "Bulk"))).toBe("Regular");
    expect(defaultProfile("dineIn", [])).toBeUndefined();
  });
});

describe("out today", () => {
  it("applies only to the day it was marked", () => {
    const item = "paneer" as ItemId;
    const records = [{ id: outOfStockId(item, DAY), itemId: item, businessDate: DAY }];
    expect(outOn(records, DAY).has(item)).toBe(true);
    expect(outOn(records, "2026-10-30" as BusinessDate).has(item)).toBe(false);
  });
});
