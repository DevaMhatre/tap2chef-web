import { describe, expect, it } from "vitest";
import type { CategoryId, ItemId, MenuItem, MenuProfile, OrderableItem, ProfileId } from "./menu";
import { paise } from "./money";
import {
  activeOrderAt,
  activeOrders,
  addToDraft,
  businessDate,
  correctPayments,
  dayBefore,
  defaultProfile,
  floorOf,
  nextToken,
  orderTotal,
  outOfStockId,
  outOn,
  sendDraft,
  settle,
  ticketOf,
  voidSent,
  withNote,
  withQuantity,
  type BusinessDate,
  type LineId,
  type Order,
  type OrderId,
  type OrderLine,
  type RoundId,
} from "./order";
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

describe("settle", () => {
  const cash = (amount: number) => ({ method: "cash" as const, amount: paise(amount) });
  const upi = (amount: number) => ({ method: "upi" as const, amount: paise(amount) });
  const sentLines = [sent(draftLine("l1", roti, 2), "r1", 10), sent(draftLine("l2", paneer), "r1", 10)];

  it("settles when payments match the dishes, and keeps what was billed", () => {
    const result = settle(order("o1"), sentLines, [cash(10000), upi(18000)], undefined, 50);
    expect(result).toEqual({
      ok: true,
      value: { ...order("o1"), state: { status: "settled", settledAt: 50, bill: { subtotal: 28000, payments: [cash(10000), upi(18000)] } } },
    });
  });

  it("frees the table", () => {
    const result = settle(order("o1"), sentLines, [cash(28000)], undefined, 50);
    expect(result.ok && activeOrders([result.value], sentLines)).toEqual([]);
  });

  it("takes the discount into account", () => {
    const discount = { amount: paise(3000), reason: "Regular" };
    expect(settle(order("o1"), sentLines, [upi(25000)], discount, 50)).toMatchObject({
      ok: true,
      value: { state: { bill: { subtotal: 28000, discount } } },
    });
    expect(settle(order("o1"), sentLines, [upi(28000)], discount, 50)).toEqual({ ok: false, error: "notExact" });
  });

  it("doesn't charge for cancelled dishes, nor count another order's", () => {
    const voided = voidSent(sentLines[1]!, 1, undefined, "x" as LineId, 20);
    const lines = [sentLines[0]!, ...(voided.ok ? voided.value : []), sent(draftLine("o2l", paneer, 1, "o2"), "r9", 1)];
    expect(settle(order("o1"), lines, [cash(4000)], undefined, 50).ok).toBe(true);
  });

  it("refuses while a dish is still in the cart", () => {
    expect(settle(order("o1"), [...sentLines, draftLine("l3", roti)], [cash(30000)], undefined, 50)).toEqual({
      ok: false,
      error: "unsent",
    });
  });

  it("refuses an empty bill and a second settle", () => {
    const voided = voidSent(sentLines[0]!, 2, undefined, "x" as LineId, 20);
    expect(settle(order("o1"), voided.ok ? voided.value : [], [], undefined, 50)).toEqual({ ok: false, error: "empty" });
    expect(settle(order("o1"), [], [], undefined, 50)).toEqual({ ok: false, error: "empty" });

    const settled = settle(order("o1"), sentLines, [cash(28000)], undefined, 50);
    expect(settled.ok && settle(settled.value, sentLines, [cash(28000)], undefined, 60)).toEqual({ ok: false, error: "settled" });
  });

  it("settles a bill of ₹0 dishes with no payment", () => {
    const water = sent(draftLine("w", dish("Water", 0)), "r1", 1);
    expect(settle(order("o1"), [water], [], undefined, 50).ok).toBe(true);
  });
});

describe("correctPayments", () => {
  const cash = (amount: number) => ({ method: "cash" as const, amount: paise(amount) });
  const upi = (amount: number) => ({ method: "upi" as const, amount: paise(amount) });
  const lines = [sent(draftLine("l1", paneer), "r1", 10)];
  const settled = settle(order("o1"), lines, [cash(23000)], { amount: paise(1000), reason: "" }, 50);
  if (!settled.ok) throw new Error(settled.error);
  const bill = settled.value;

  it("changes the method, keeps the amount and the discount, and leaves a mark", () => {
    expect(correctPayments(bill, [upi(23000)], 90)).toMatchObject({
      ok: true,
      value: {
        state: {
          status: "settled",
          settledAt: 50,
          correctedAt: 90,
          bill: { subtotal: 24000, discount: { amount: 1000 }, payments: [upi(23000)] },
        },
      },
    });
    expect(correctPayments(bill, [cash(3000), upi(20000)], 90).ok).toBe(true);
  });

  it("never moves the amount", () => {
    expect(correctPayments(bill, [upi(24000)], 90)).toEqual({ ok: false, error: "amountChanged" });
    expect(correctPayments(bill, [cash(23000), upi(0)], 90)).toEqual({ ok: false, error: "zeroPayment" });
  });

  it("applies only to a settled bill", () => {
    expect(correctPayments(order("o1"), [], 90)).toEqual({ ok: false, error: "notSettled" });
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
