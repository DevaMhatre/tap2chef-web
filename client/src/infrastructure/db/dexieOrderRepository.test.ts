import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import type { ItemId, ProfileId } from "../../domain/menu";
import { paise } from "../../domain/money";
import type { BusinessDate, LineId, Order, OrderId, OrderLine, Payment, PaymentId, RoundId } from "../../domain/order";
import type { DiningTable, TableId } from "../../domain/tables";
import type { OrderSnapshot } from "../../usecases/ports";
import { db } from "./db";
import { dexieOrderRepository } from "./dexieOrderRepository";

const TODAY = "2026-10-29" as BusinessDate;
const table: DiningTable = { id: "t1" as TableId, name: "1", sortKey: "1" };
const order: Order = {
  id: "o1" as OrderId,
  channel: { type: "dineIn", tableId: table.id },
  profileId: "dine" as ProfileId,
  businessDate: TODAY,
  openedAt: 100,
  state: { status: "open" },
};
const line: OrderLine = {
  id: "l1" as LineId,
  orderId: order.id,
  itemId: "roti" as ItemId,
  name: "Roti",
  diet: "veg",
  unitPrice: paise(2000),
  quantity: 2,
  note: "",
  addedAt: 100,
  state: { status: "voided", roundId: "r1" as RoundId, sentAt: 110, voidedAt: 120, reason: "wrongEntry" },
};

function next(since: BusinessDate, until: (s: OrderSnapshot) => boolean): Promise<OrderSnapshot> {
  return new Promise((resolve) => {
    const unsubscribe = dexieOrderRepository.subscribe(since, (s) => {
      if (until(s)) {
        unsubscribe();
        resolve(s);
      }
    });
  });
}

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe("dexieOrderRepository", () => {
  it("round-trips tables, orders, lines and out-of-stock with their outbox entries", async () => {
    const out = { id: `roti@${TODAY}`, itemId: "roti" as ItemId, businessDate: TODAY };
    await dexieOrderRepository.write([
      { op: "put", table: "tables", record: table },
      { op: "put", table: "orders", record: order },
      { op: "put", table: "lines", record: line },
      { op: "put", table: "outOfStock", record: out },
    ]);
    const s = await next(TODAY, (s) => s.lines.length === 1);
    expect(s).toEqual({ tables: [table], orders: [order], lines: [line], payments: [], outOfStock: [out] });
    expect((await db.orders.get(order.id))!.status).toBe("open");
    expect(await db.outbox.count()).toBe(4);
  });

  it("round-trips a billed and a settled order with their payments, and undo leaves nothing behind", async () => {
    const billed: Order = { ...order, state: { status: "billed", billedAt: 150, discount: { amount: paise(500), reason: "Regular" } } };
    const payment: Payment = { id: "p1" as PaymentId, orderId: order.id, amount: paise(1500), receivedAt: 160, method: "cash" };
    const upi: Payment = {
      id: "p2" as PaymentId,
      orderId: order.id,
      amount: paise(2000),
      receivedAt: 170,
      method: "upi",
      correctedAt: 300,
      removedAt: 310,
    };
    await dexieOrderRepository.write([
      { op: "put", table: "orders", record: billed },
      { op: "put", table: "payments", record: payment },
    ]);
    expect(await next(TODAY, (s) => s.payments.length === 1)).toMatchObject({ orders: [billed], payments: [payment] });
    expect((await db.orders.get(order.id))!.status).toBe("billed");

    const settled: Order = {
      ...order,
      state: { status: "settled", billedAt: 150, settledAt: 200, subtotal: paise(4000), discount: { amount: paise(500), reason: "Regular" } },
    };
    await dexieOrderRepository.write([
      { op: "put", table: "orders", record: settled },
      { op: "put", table: "payments", record: upi },
    ]);
    expect(await next(TODAY, (s) => s.payments.length === 2)).toMatchObject({ orders: [settled], payments: [payment, upi] });

    await dexieOrderRepository.write([
      { op: "put", table: "orders", record: order },
      { op: "remove", table: "payments", record: upi },
    ]);
    const after = await next(TODAY, (s) => s.orders[0]?.state.status === "open");
    expect(after.payments).toEqual([payment]);
    expect((await db.orders.get(order.id))!.state).toEqual({ status: "open" });
  });

  it("skips malformed payments from sync", async () => {
    const meta = { tenantId: "t", createdAt: 1, updatedAt: 1, deleted: false };
    await dexieOrderRepository.write([{ op: "put", table: "orders", record: order }]);
    await db.payments.bulkPut([
      { ...meta, id: "good", orderId: order.id, amount: 100, receivedAt: 5, method: "cash" },
      { ...meta, id: "card", orderId: order.id, amount: 100, receivedAt: 5, method: "card" },
      { ...meta, id: "float", orderId: order.id, amount: 1.5, receivedAt: 5, method: "upi" },
      { ...meta, id: "zero", orderId: order.id, amount: 0, receivedAt: 5, method: "upi" },
    ]);
    expect((await next(TODAY, (s) => s.payments.length > 0)).payments.map((p) => p.id)).toEqual(["good"]);
  });

  it("leaves out yesterday's out-of-stock but keeps an order still open from yesterday", async () => {
    const yesterday = "2026-10-28" as BusinessDate;
    await dexieOrderRepository.write([
      { op: "put", table: "orders", record: { ...order, businessDate: yesterday } },
      { op: "put", table: "outOfStock", record: { id: "x", itemId: "roti" as ItemId, businessDate: yesterday } },
    ]);
    const s = await next(TODAY, (s) => s.orders.length === 1);
    expect(s.outOfStock).toEqual([]);
  });

  it("skips malformed lines from sync", async () => {
    const meta = { tenantId: "t", createdAt: 1, updatedAt: 1, deleted: false };
    await dexieOrderRepository.write([{ op: "put", table: "orders", record: order }]);
    await db.orderItems.bulkPut([
      { ...meta, ...line, id: "good" },
      { ...meta, ...line, id: "float", unitPrice: 12.5 },
      { ...meta, ...line, id: "zero", quantity: 0 },
      { ...meta, ...line, id: "state", state: { status: "cooking" } },
    ]);
    const s = await next(TODAY, (s) => s.lines.length > 0);
    expect(s.lines.map((l) => l.id)).toEqual(["good"]);
  });
});
