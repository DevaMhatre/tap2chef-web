import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import type { ItemId, ProfileId } from "../../domain/menu";
import { paise } from "../../domain/money";
import type { BusinessDate, LineId, Order, OrderId, OrderLine, RoundId } from "../../domain/order";
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
    expect(s).toEqual({ tables: [table], orders: [order], lines: [line], outOfStock: [out] });
    expect((await db.orders.get(order.id))!.status).toBe("open");
    expect(await db.outbox.count()).toBe(4);
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
