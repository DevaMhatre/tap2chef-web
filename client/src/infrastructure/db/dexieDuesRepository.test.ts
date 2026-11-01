import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import type { Repayment, RepaymentId } from "../../domain/dues";
import { paise } from "../../domain/money";
import type { BusinessDate, OrderId, Payment, PaymentId } from "../../domain/order";
import type { DuesSnapshot } from "../../usecases/ports";
import { db } from "./db";
import { dexieDuesRepository } from "./dexieDuesRepository";
import { dexieOrderRepository } from "./dexieOrderRepository";

function next(until: (s: DuesSnapshot) => boolean): Promise<DuesSnapshot> {
  return new Promise((resolve) => {
    const unsubscribe = dexieDuesRepository.subscribe((s) => {
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

describe("dexieDuesRepository", () => {
  it("reads every bill on a name, from any day, and what was paid back; undo leaves nothing", async () => {
    const later = { id: "p1" as PaymentId, orderId: "old" as OrderId, amount: paise(30000), receivedAt: 1, method: "later", customer: "Sharma ji", phone: "9876543210" } as Payment;
    const cash = { id: "p2" as PaymentId, orderId: "old" as OrderId, amount: paise(100), receivedAt: 1, method: "cash" } as Payment;
    await dexieOrderRepository.write([
      { op: "put", table: "payments", record: later },
      { op: "put", table: "payments", record: cash },
    ]);
    const back: Repayment = { id: "r1" as RepaymentId, customer: "Sharma ji", phone: "9876543210", amount: paise(10000), method: "cash", receivedAt: 5, businessDate: "2026-10-30" as BusinessDate, by: "Ravi" };
    await dexieDuesRepository.write([{ table: "repayments", record: back, op: "put" }]);
    const s = await next((s) => s.repayments.length === 1);
    expect(s).toEqual({ later: [later], repayments: [back] });
    expect(await db.outbox.where("table").equals("repayments").count()).toBe(1);

    await dexieDuesRepository.write([{ table: "repayments", record: back, op: "remove" }]);
    expect((await next((s) => s.repayments.length === 0)).repayments).toEqual([]);
  });

  it("skips a malformed repayment from sync", async () => {
    const meta = { accountId: "a", createdAt: 1, updatedAt: 1, deleted: false };
    await db.repayments.bulkPut([
      { ...meta, id: "ok", customer: "A", phone: "9876543210", amount: 100, method: "upi", receivedAt: 1, businessDate: "2026-10-30" },
      { ...meta, id: "later", customer: "A", phone: "9876543210", amount: 100, method: "later", receivedAt: 1, businessDate: "2026-10-30" },
      { ...meta, id: "noname", phone: "9876543210", amount: 100, method: "cash", receivedAt: 1, businessDate: "2026-10-30" },
      { ...meta, id: "nophone", customer: "A", amount: 100, method: "cash", receivedAt: 1, businessDate: "2026-10-30" },
    ]);
    expect((await next((s) => s.repayments.length > 0)).repayments.map((r) => r.id)).toEqual(["ok"]);
  });
});
