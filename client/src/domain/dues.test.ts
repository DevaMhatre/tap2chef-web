import { describe, expect, it } from "vitest";
import { duesOf, knownCustomers, owedBy, receiveRepayment, repaidOn, totalOwed, type Repayment, type RepaymentId } from "./dues";
import { paise } from "./money";
import type { BusinessDate, OrderId, Payment, PaymentId } from "./order";

const rupees = (n: number) => paise(n * 100);
const SHARMA = "9876543210";
const RAVI = "9123456780";
const RAVI_2 = "9988776655";
const later = (id: string, customer: string, phone: string, amount: number, at: number, extra: Partial<Payment> = {}): Payment =>
  ({ id: id as PaymentId, orderId: `o-${id}` as OrderId, amount: rupees(amount), receivedAt: at, method: "later", customer, phone, ...extra }) as Payment;
const back = (id: string, customer: string, phone: string, amount: number, at: number, method: "cash" | "upi" = "cash"): Repayment => ({
  id: id as RepaymentId,
  customer,
  phone,
  amount: rupees(amount),
  method,
  receivedAt: at,
  businessDate: "2026-10-30" as BusinessDate,
});
const cash = (id: string, amount: number): Payment =>
  ({ id: id as PaymentId, orderId: "o" as OrderId, amount: rupees(amount), receivedAt: 1, method: "cash" }) as Payment;

describe("duesOf", () => {
  it("adds a regular's bills by their number, under the name last written, and takes off what came back", () => {
    const dues = duesOf(
      [later("a", "Sharma ji", SHARMA, 300, 1), later("b", "Sharma Uncle", SHARMA, 200, 2), cash("c", 999)],
      [back("r", "Sharma ji", SHARMA, 100, 3)],
    );
    expect(dues).toHaveLength(1);
    expect(dues[0]).toMatchObject({ customer: "Sharma ji", phone: SHARMA, owed: rupees(400) });
    expect(totalOwed(dues)).toBe(rupees(400));
  });

  it("keeps two regulars with one name apart by their numbers", () => {
    const dues = duesOf([later("a", "Ravi", RAVI, 100, 1), later("b", "Ravi", RAVI_2, 50, 2)], []);
    expect(dues.map((d) => [d.phone, d.owed])).toEqual([
      [RAVI, rupees(100)],
      [RAVI_2, rupees(50)],
    ]);
  });

  it("dates the debt from the oldest bill not yet paid back", () => {
    const [due] = duesOf([later("a", "Ravi", RAVI, 300, 10), later("b", "Ravi", RAVI, 200, 20)], [back("r", "Ravi", RAVI, 300, 30)]);
    expect(due).toMatchObject({ owed: rupees(200), since: 20 });
  });

  it("leaves out whoever is square, shows a regular paid back twice, and puts the longest waiting first", () => {
    const dues = duesOf(
      [later("a", "Paid up", "9000000001", 100, 1), later("b", "New", "9000000002", 50, 9), later("c", "Old", "9000000003", 50, 2), later("d", "Twice", "9000000004", 100, 3)],
      [back("r1", "Paid up", "9000000001", 100, 5), back("r2", "Twice", "9000000004", 100, 6), back("r3", "Twice", "9000000004", 100, 7)],
    );
    expect(dues.map((d) => [d.customer, d.owed])).toEqual([
      ["Old", rupees(50)],
      ["New", rupees(50)],
      ["Twice", -rupees(100)],
    ]);
    expect(totalOwed(dues)).toBe(rupees(100));
  });

  it("ignores a removed bill", () => {
    expect(duesOf([later("a", "Ravi", RAVI, 300, 1, { removedAt: 2 })], [])).toEqual([]);
  });
});

describe("knownCustomers", () => {
  it("lists each regular once, most recent first, with the name last written for their number", () => {
    expect(knownCustomers([later("a", "ravi", RAVI, 1, 1), later("b", "Sharma ji", SHARMA, 1, 2), later("c", "Ravi", RAVI, 1, 3)], [back("r", "Mehta", "9000000009", 1, 0)])).toEqual([
      { name: "Ravi", phone: RAVI },
      { name: "Sharma ji", phone: SHARMA },
      { name: "Mehta", phone: "9000000009" },
    ]);
    expect(knownCustomers(Array.from({ length: 9 }, (_, i) => later(`${i}`, `P${i}`, `900000000${i}`, 1, i)), [], 6)).toHaveLength(6);
  });
});

describe("receiveRepayment", () => {
  const [due] = duesOf([later("a", "Sharma ji", SHARMA, 500, 1)], []);

  it("takes part or all; cash above what is owed gives change, UPI must be exact", () => {
    const part = receiveRepayment(due, "upi", rupees(200), "r1" as RepaymentId, new Date(2026, 9, 30, 13).getTime(), "Ravi");
    expect(part).toMatchObject({
      ok: true,
      value: { change: 0, repayment: { customer: "Sharma ji", phone: SHARMA, amount: rupees(200), method: "upi", businessDate: "2026-10-30", by: "Ravi" } },
    });
    expect(receiveRepayment(due, "cash", rupees(1000), "r2" as RepaymentId, 1)).toMatchObject({ ok: true, value: { change: rupees(500), repayment: { amount: rupees(500) } } });
    expect(receiveRepayment(due, "upi", rupees(600), "r3" as RepaymentId, 1)).toEqual({ ok: false, error: "moreThanDue" });
    expect(receiveRepayment(due, "cash", paise(0), "r4" as RepaymentId, 1)).toEqual({ ok: false, error: "zero" });
  });

  it("refuses when nothing is owed", () => {
    expect(receiveRepayment(undefined, "cash", rupees(1), "r" as RepaymentId, 1)).toEqual({ ok: false, error: "nothingOwed" });
  });

  it("tells what a number owes, zero for a new one", () => {
    expect(owedBy([due!], SHARMA)).toBe(rupees(500));
    expect(owedBy([due!], RAVI)).toBe(0);
  });
});

describe("repaidOn", () => {
  it("counts money back on the day it came, by drawer", () => {
    const day = "2026-10-30" as BusinessDate;
    expect(
      repaidOn([back("a", "X", RAVI, 100, 1), back("b", "Y", SHARMA, 50, 1, "upi"), { ...back("c", "Z", RAVI_2, 70, 1), businessDate: "2026-10-29" as BusinessDate }], day),
    ).toEqual({ total: rupees(150), cash: rupees(100), upi: rupees(50) });
  });
});
