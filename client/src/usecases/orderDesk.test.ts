import { describe, expect, it } from "vitest";
import type { CategoryId, ItemId, MenuItem, OrderableItem, ProfileId } from "../domain/menu";
import { paise } from "../domain/money";
import { activeOrders, ticketOf, type Order, type OrderId, type PaymentId } from "../domain/order";
import { sortByOrder } from "../domain/ordering";
import type { TableId } from "../domain/tables";
import { fakeClock, fakeIds, fakeOrderRepository } from "./fakes";
import { createOrderDesk } from "./orderDesk";
import type { OrderSnapshot } from "./ports";

const NOON = new Date(2026, 9, 29, 12, 0).getTime();
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
const roti = dish("roti", 2000);
const paneer = dish("paneer", 24000);

const t1 = "t1" as TableId;
const t2 = "t2" as TableId;
const tables: OrderSnapshot["tables"] = [
  { id: t1, name: "1", sortKey: "1" },
  { id: t2, name: "2", sortKey: "2" },
];

// What the order screen hands the desk before anything is stored.
const pending = (id: string, channel: Order["channel"] = { type: "dineIn", tableId: t1 }): Order => ({
  id: id as OrderId,
  channel,
  profileId: dineIn,
  businessDate: "" as Order["businessDate"],
  openedAt: 0,
  state: { status: "open" },
});
const takeaway = (id: string) => pending(id, { type: "takeaway", token: 0 });

async function setup(initial: Partial<OrderSnapshot> = { tables }) {
  const fake = fakeOrderRepository(initial);
  const time = fakeClock(NOON);
  const desk = createOrderDesk(fake.repository, fakeIds(), time.clock);
  desk.subscribe(() => {});
  await Promise.resolve(); // first emission
  return { fake, time, desk: desk.commands };
}

const linesOf = (s: OrderSnapshot, orderId: string) => s.lines.filter((l) => l.orderId === orderId);

describe("tables", () => {
  it("sets up numbered tables once, even on a double tap", async () => {
    const { fake, desk } = await setup({});
    await Promise.all([desk.setUpTables(4), desk.setUpTables(4)]);
    expect(sortByOrder(fake.current().tables).map((t) => t.name)).toEqual(["1", "2", "3", "4"]);
    expect(fake.writes).toHaveLength(1);
    expect(await desk.setUpTables(0)).toEqual({ ok: false, error: "invalidCount" });
  });

  it("adds the next number at the end", async () => {
    const { fake, desk } = await setup();
    await desk.addTable();
    expect(sortByOrder(fake.current().tables).map((t) => t.name)).toEqual(["1", "2", "3"]);
  });

  it("won't remove a table with an order running, and undoes a removal", async () => {
    const { fake, desk } = await setup();
    await desk.addDish(pending("o1"), roti);
    expect(await desk.removeTable(t1)).toEqual({ ok: false, error: "occupied" });

    const removed = await desk.removeTable(t2);
    expect(fake.current().tables.map((t) => t.id)).toEqual([t1]);
    if (removed.ok) await removed.value();
    expect(fake.current().tables.map((t) => t.id).sort()).toEqual([t1, t2]);
  });

  it("checks table names", async () => {
    const { desk } = await setup();
    expect(await desk.renameTable(t1, "  Garden   2 ")).toMatchObject({ ok: true, value: { name: "Garden 2" } });
    expect(await desk.renameTable(t1, "x".repeat(13))).toEqual({ ok: false, error: "tooLong" });
  });
});

describe("addDish", () => {
  it("stores the order with its first dish, stamped with today", async () => {
    const { fake, desk } = await setup();
    await desk.addDish(pending("o1"), roti);
    expect(fake.current().orders).toEqual([
      { ...pending("o1"), businessDate: "2026-10-29", openedAt: NOON },
    ]);
    expect(linesOf(fake.current(), "o1")).toMatchObject([{ name: "roti", unitPrice: 2000, quantity: 1 }]);
  });

  it("counts every rapid tap", async () => {
    const { fake, desk } = await setup();
    const release = fake.hold();
    const taps = [desk.addDish(pending("o1"), roti), desk.addDish(pending("o1"), roti), desk.addDish(pending("o1"), roti)];
    release();
    await Promise.all(taps);
    expect(fake.current().orders).toHaveLength(1);
    expect(linesOf(fake.current(), "o1")).toMatchObject([{ quantity: 3 }]);
  });

  it("joins the table's running order if another tab opened it first", async () => {
    const { fake, desk } = await setup();
    await desk.addDish(pending("first"), roti);
    await desk.addDish(pending("second"), paneer);
    expect(fake.current().orders.map((o) => o.id)).toEqual(["first"]);
    expect(linesOf(fake.current(), "first")).toHaveLength(2);
  });

  it("gives each takeaway the next token when it is stored", async () => {
    const { fake, desk } = await setup();
    await desk.addDish(takeaway("a"), roti);
    await desk.addDish(takeaway("b"), roti);
    await desk.addDish(takeaway("a"), roti);
    expect(fake.current().orders.map((o) => o.channel)).toEqual([
      { type: "takeaway", token: 1 },
      { type: "takeaway", token: 2 },
    ]);
  });

  it("refuses a dish that is out today", async () => {
    const { fake, desk } = await setup();
    await desk.setOutToday(paneer.item.id, true);
    expect(await desk.addDish(pending("o1"), paneer)).toEqual({ ok: false, error: "outToday" });
    expect(fake.current().orders).toEqual([]);
  });
});

describe("the cart", () => {
  it("steps quantity with every tap, and removing the last one can be undone", async () => {
    const { fake, desk } = await setup();
    const line = await desk.addDish(pending("o1"), roti);
    if (!line.ok) throw new Error("not added");
    await Promise.all([desk.stepQuantity(line.value.id, 1), desk.stepQuantity(line.value.id, 1)]);
    expect(linesOf(fake.current(), "o1")[0]!.quantity).toBe(3);

    await desk.stepQuantity(line.value.id, -1);
    await desk.stepQuantity(line.value.id, -1);
    const removed = await desk.stepQuantity(line.value.id, -1);
    expect(linesOf(fake.current(), "o1")).toEqual([]);
    expect(activeOrders(fake.current().orders, fake.current().lines)).toEqual([]);

    if (removed.ok && removed.value) await removed.value();
    expect(linesOf(fake.current(), "o1")).toMatchObject([{ quantity: 1 }]);
  });

  it("sends the cart as one round, once, however fast Send is tapped", async () => {
    const { fake, desk } = await setup();
    await desk.addDish(pending("o1"), roti);
    await desk.addDish(pending("o1"), paneer);
    const [first, second] = await Promise.all([desk.send("o1" as OrderId), desk.send("o1" as OrderId)]);
    expect([first, second]).toEqual([2, 2]);
    expect(await desk.send("o1" as OrderId)).toBe(0);

    const ticket = ticketOf(linesOf(fake.current(), "o1"));
    expect(ticket.rounds).toHaveLength(1);
    expect(ticket.draft).toEqual([]);
  });

  it("locks sent dishes: no quantity change, no removal", async () => {
    const { desk } = await setup();
    const line = await desk.addDish(pending("o1"), roti);
    await desk.send("o1" as OrderId);
    if (!line.ok) throw new Error("not added");
    expect(await desk.stepQuantity(line.value.id, 1)).toEqual({ ok: false, error: "notDraft" });
    expect(await desk.removeLine(line.value.id)).toEqual({ ok: false, error: "notDraft" });
  });
});

describe("voidLine", () => {
  it("cancels part of a sent dish, marks it out of stock, and undoes both", async () => {
    const { fake, desk } = await setup();
    for (let i = 0; i < 3; i++) await desk.addDish(pending("o1"), paneer);
    await desk.send("o1" as OrderId);
    const [line] = linesOf(fake.current(), "o1");

    const result = await desk.voidLine(line!.id, 2, "outOfStock");
    const ticket = ticketOf(linesOf(fake.current(), "o1"));
    expect(ticket.total).toBe(24000);
    expect(ticket.rounds[0]!.lines.map((l) => [l.quantity, l.state.status])).toEqual([
      [1, "sent"],
      [2, "voided"],
    ]);
    expect(fake.current().outOfStock).toMatchObject([{ itemId: "paneer", businessDate: "2026-10-29" }]);

    if (result.ok) await result.value();
    expect(linesOf(fake.current(), "o1")).toMatchObject([{ quantity: 3, state: { status: "sent" } }]);
    expect(fake.current().outOfStock).toEqual([]);
  });

  it("frees the table when everything is cancelled, keeping the record", async () => {
    const { fake, desk } = await setup();
    await desk.addDish(pending("o1"), roti);
    await desk.send("o1" as OrderId);
    await desk.voidLine(linesOf(fake.current(), "o1")[0]!.id, 1, "guestChangedMind");
    expect(activeOrders(fake.current().orders, fake.current().lines)).toEqual([]);
    expect(linesOf(fake.current(), "o1")).toMatchObject([{ state: { status: "voided", reason: "guestChangedMind" } }]);
  });
});

describe("moveOrder", () => {
  it("moves to a free table only", async () => {
    const { fake, desk } = await setup();
    await desk.addDish(pending("o1"), roti);
    await desk.addDish(pending("o2", { type: "dineIn", tableId: t2 }), roti);
    expect(await desk.moveOrder("o1" as OrderId, t2)).toEqual({ ok: false, error: "occupied" });

    const t3 = await desk.addTable();
    expect(await desk.moveOrder("o1" as OrderId, t3.id)).toEqual({ ok: true, value: undefined });
    expect(fake.current().orders.find((o) => o.id === "o1")!.channel).toEqual({ type: "dineIn", tableId: t3.id });
  });
});

describe("setOutToday", () => {
  it("marks and clears a dish for today only", async () => {
    const { fake, time, desk } = await setup();
    await desk.setOutToday(roti.item.id, true);
    await desk.setOutToday(roti.item.id, true);
    expect(fake.current().outOfStock).toHaveLength(1);

    time.advance(24 * 60 * 60 * 1000);
    expect(await desk.addDish(pending("o1"), roti)).toMatchObject({ ok: true });
    await desk.setOutToday(roti.item.id, false); // nothing marked today
    expect(fake.current().outOfStock).toHaveLength(1);
  });
});

describe("the bill", () => {
  const o1 = "o1" as OrderId;
  const upi = { method: "upi" as const };
  const cash = { method: "cash" as const };

  // Roti + Paneer, sent: ₹260.
  async function served() {
    const ctx = await setup();
    await ctx.desk.addDish(pending("o1"), roti);
    await ctx.desk.addDish(pending("o1"), paneer);
    await ctx.desk.send(o1);
    return ctx;
  }
  async function billed() {
    const ctx = await served();
    expect(await ctx.desk.presentBill(o1)).toEqual({ ok: true, value: undefined });
    return ctx;
  }
  const state = (fake: Awaited<ReturnType<typeof setup>>["fake"]) => fake.current().orders.find((o) => o.id === "o1")!.state;

  it("is presented once, keeps the table, and refuses while a dish is unsent", async () => {
    const { fake, desk } = await served();
    await Promise.all([desk.presentBill(o1), desk.presentBill(o1)]);
    expect(state(fake)).toEqual({ status: "billed", billedAt: NOON });
    expect(activeOrders(fake.current().orders, fake.current().lines)).toHaveLength(1);

    await desk.addDish(pending("o1"), roti);
    expect(state(fake)).toEqual({ status: "open" }); // one more dish: the bill no longer stands
    expect(await desk.presentBill(o1)).toEqual({ ok: false, error: "unsent" });
  });

  it("takes money in parts and settles on the last, once however fast Settle is tapped", async () => {
    const { fake, desk } = await billed();
    const part = await desk.receive(o1, upi, paise(10000));
    expect(part).toMatchObject({ ok: true, value: { settled: false } });
    const [a, b] = await Promise.all([desk.receive(o1, cash, paise(16000)), desk.receive(o1, cash, paise(16000))]);
    expect(a).toMatchObject({ ok: true, value: { settled: true } });
    expect(b).toBe(a);
    expect(fake.current().payments.map((p) => [p.method, p.amount])).toEqual([
      ["upi", 10000],
      ["cash", 16000],
    ]);
    expect(state(fake)).toEqual({ status: "settled", billedAt: NOON, settledAt: NOON, subtotal: 26000 });
    expect(activeOrders(fake.current().orders, fake.current().lines, fake.current().payments)).toEqual([]);
    expect(await desk.receive(o1, cash, paise(100))).toEqual({ ok: false, error: "notBilled" });
  });

  it("records the discount with the payment", async () => {
    const { fake, desk } = await billed();
    const discount = { amount: paise(6000), reason: "Regular" };
    expect(await desk.receive(o1, upi, paise(20000), discount)).toMatchObject({ ok: true, value: { settled: true } });
    expect(state(fake)).toMatchObject({ status: "settled", subtotal: 26000, discount });
  });

  it("undoes the payment that settled, reopening the bill, unless the table is taken since", async () => {
    const { fake, desk } = await billed();
    const paid = await desk.receive(o1, upi, paise(26000));
    if (!paid.ok) throw new Error(paid.error);
    await paid.value.undo();
    expect(state(fake)).toEqual({ status: "billed", billedAt: NOON });
    expect(fake.current().payments).toEqual([]);

    const again = await desk.receive(o1, upi, paise(26000));
    await desk.addDish(pending("next"), roti);
    if (again.ok) await again.value.undo();
    expect(state(fake).status).toBe("settled");
    expect(fake.current().payments).toHaveLength(1);
  });

  it("undoes a part payment without touching the bill", async () => {
    const { fake, desk } = await billed();
    const part = await desk.receive(o1, upi, paise(10000));
    if (part.ok) await part.value.undo();
    expect(fake.current().payments).toEqual([]);
    expect(state(fake).status).toBe("billed");
  });

  it("refuses money the stored bill doesn't owe", async () => {
    const { desk } = await billed();
    expect(await desk.receive(o1, upi, paise(26001))).toEqual({ ok: false, error: "moreThanDue" });
    expect(await desk.receive("nope" as OrderId, upi, paise(1))).toEqual({ ok: false, error: "missing" });
  });

  it("closes a bill with nothing to pay", async () => {
    const { fake, desk } = await billed();
    expect(await desk.closeBill(o1)).toEqual({ ok: false, error: "unpaid" });
    const closed = await desk.closeBill(o1, { amount: paise(26000), reason: "On the house" });
    expect(closed.ok).toBe(true);
    expect(state(fake)).toMatchObject({ status: "settled", discount: { reason: "On the house" } });
  });

  it("locks a settled bill: no cancelling, no moving", async () => {
    const { fake, desk } = await billed();
    await desk.receive(o1, cash, paise(26000));
    const [line] = linesOf(fake.current(), "o1");
    expect(await desk.voidLine(line!.id, 1)).toEqual({ ok: false, error: "settled" });
    const t3 = await desk.addTable();
    await desk.moveOrder(o1, t3.id);
    expect(fake.current().orders[0]!.channel).toEqual({ type: "dineIn", tableId: t1 });
  });

  it("starts the table's next order when a dish lands on a settled one; a paid token takes nothing more", async () => {
    const { fake, desk } = await billed();
    await desk.receive(o1, cash, paise(26000));
    const added = await desk.addDish(pending("o1"), roti);
    expect(added.ok && added.value.orderId).not.toBe("o1");
    expect(fake.current().orders).toHaveLength(2);

    await desk.addDish(takeaway("tk"), roti);
    await desk.send("tk" as OrderId);
    await desk.presentBill("tk" as OrderId);
    await desk.receive("tk" as OrderId, cash, paise(2000));
    expect(await desk.addDish(takeaway("tk"), roti)).toEqual({ ok: false, error: "settled" });
  });

  it("corrects a payment's method, keeping its amount", async () => {
    const { fake, desk } = await billed();
    await desk.receive(o1, cash, paise(26000));
    const [payment] = fake.current().payments;
    expect(await desk.correctPayment(payment!.id, "cash")).toEqual({ ok: false, error: "unchanged" });
    expect(await desk.correctPayment(payment!.id, "upi")).toEqual({ ok: true, value: undefined });
    expect(fake.current().payments).toMatchObject([{ method: "upi", amount: 26000, correctedAt: NOON }]);
  });

  it("removes a wrong part payment, keeps it listed, and undoes the removal", async () => {
    const { fake, desk } = await billed();
    await desk.receive(o1, upi, paise(20000)); // ₹200 typed for ₹20
    const [payment] = fake.current().payments;
    const removed = await desk.removePayment(payment!.id);
    expect(fake.current().payments).toMatchObject([{ id: payment!.id, removedAt: NOON }]);
    expect(await desk.receive(o1, upi, paise(26000))).toMatchObject({ ok: true, value: { settled: true } });

    if (removed.ok) await removed.value();
    expect(fake.current().payments[0]!.removedAt).toBeUndefined();
  });

  it("won't leave a settled bill short", async () => {
    const { fake, desk } = await billed();
    await desk.receive(o1, cash, paise(26000));
    const [payment] = fake.current().payments;
    expect(await desk.removePayment(payment!.id)).toEqual({ ok: false, error: "leavesShort" });
    expect(await desk.correctPayment("nope" as PaymentId, "upi")).toEqual({ ok: false, error: "missing" });
  });
});
