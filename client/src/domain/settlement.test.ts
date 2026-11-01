import { describe, expect, it } from "vitest";
import { paise } from "./money";
import { amountDue, discountTo, quoteBill, readPhone, receiptFor, takings, type BillInput } from "./settlement";

const rupees = (r: number) => paise(r * 100);

describe("discountTo", () => {
  it("turns the final amount into a discount", () => {
    expect(discountTo(rupees(890), rupees(850), "  Regular  ")).toEqual({
      ok: true,
      value: { amount: rupees(40), reason: "Regular" },
    });
    expect(amountDue(rupees(890), { amount: rupees(40), reason: "" })).toBe(rupees(850));
  });

  it("is no discount when the amount is unchanged, and allows on the house", () => {
    expect(discountTo(rupees(890), rupees(890))).toEqual({ ok: true, value: undefined });
    expect(discountTo(rupees(890), rupees(0))).toMatchObject({ ok: true, value: { amount: rupees(890) } });
  });

  it("never goes upward, nor below what was already received", () => {
    expect(discountTo(rupees(890), rupees(900))).toEqual({ ok: false, error: "upward" });
    expect(discountTo(rupees(890), rupees(250), "", rupees(300))).toEqual({ ok: false, error: "belowPaid" });
    expect(discountTo(rupees(890), rupees(300), "", rupees(300)).ok).toBe(true);
  });

  it("keeps the reason short", () => {
    expect(discountTo(rupees(890), rupees(850), "x".repeat(81))).toEqual({ ok: false, error: "tooLong" });
  });
});

describe("receiptFor", () => {
  it("records what came in, up to what is left", () => {
    expect(receiptFor("upi", rupees(300), rupees(660))).toEqual({ ok: true, value: { amount: rupees(300), change: 0 } });
    expect(receiptFor("cash", rupees(660), rupees(660))).toEqual({ ok: true, value: { amount: rupees(660), change: 0 } });
  });

  it("gives change for a bigger note, but UPI is exact", () => {
    expect(receiptFor("cash", rupees(1000), rupees(660))).toEqual({ ok: true, value: { amount: rupees(660), change: rupees(340) } });
    expect(receiptFor("upi", rupees(1000), rupees(660))).toEqual({ ok: false, error: "moreThanDue" });
  });

  it("refuses nothing, and anything once nothing is left", () => {
    expect(receiptFor("cash", paise(0), rupees(660))).toEqual({ ok: false, error: "zero" });
    expect(receiptFor("cash", rupees(10), paise(0))).toEqual({ ok: false, error: "moreThanDue" });
  });
});

describe("takings", () => {
  it("adds the day's payments by drawer", () => {
    const payments = [
      { method: "cash" as const, amount: rupees(500) },
      { method: "upi" as const, amount: rupees(390) },
      { method: "cash" as const, amount: rupees(280) },
    ];
    expect(takings(payments)).toEqual({ total: rupees(1170), cash: rupees(780), upi: rupees(390), later: 0 });
    expect(takings([])).toEqual({ total: 0, cash: 0, upi: 0, later: 0 });
    expect(takings([{ method: "later", customer: "Sharma ji", phone: "9876543210", amount: rupees(300) }])).toMatchObject({ total: rupees(300), cash: 0, later: rupees(300) });
  });
});

describe("amountDue", () => {
  it("is the bill less the discount, never below nothing when a dish was cancelled on another phone", () => {
    expect(amountDue(rupees(300), { amount: rupees(50), reason: "" })).toBe(rupees(250));
    expect(amountDue(rupees(200), { amount: rupees(250), reason: "" })).toBe(0);
  });
});

describe("readPhone", () => {
  it("reads a mobile however it is typed, as its ten digits", () => {
    for (const typed of ["9876543210", "98765 43210", "+91 98765-43210", "919876543210", "098765 43210", "(98765) 43210"]) {
      expect(readPhone(typed)).toEqual({ ok: true, value: "9876543210" });
    }
  });

  it("refuses what can't be an Indian mobile", () => {
    expect(readPhone("")).toEqual({ ok: false, error: "noPhone" });
    for (const typed of ["12345", "5876543210", "98765432101", "98765abcde"]) expect(readPhone(typed)).toEqual({ ok: false, error: "badPhone" });
  });
});

describe("quoteBill", () => {
  const empty: BillInput = { finalAmount: "", reason: "", method: null, received: "", customer: "", phone: "" };

  it("is the whole bill, and no payment until a method is chosen", () => {
    expect(quoteBill(rupees(660), paise(0), empty)).toEqual({
      subtotal: rupees(660),
      due: rupees(660),
      discount: { ok: true, value: undefined },
      paid: 0,
      remaining: rupees(660),
      receipt: null,
      tender: null,
      settles: false,
    });
  });

  it("puts a bill on a regular's name only once they are named, and never more than is due", () => {
    const later = { ...empty, method: "later" as const, received: "660" };
    expect(quoteBill(rupees(660), paise(0), later)).toMatchObject({ settles: true, tender: { ok: false, error: "noCustomer" } });
    expect(quoteBill(rupees(660), paise(0), { ...later, customer: "Sharma ji" }).tender).toEqual({ ok: false, error: "noPhone" });
    expect(quoteBill(rupees(660), paise(0), { ...later, customer: "  Sharma   ji ", phone: "+91 98765-43210" }).tender).toEqual({
      ok: true,
      value: { method: "later", customer: "Sharma ji", phone: "9876543210" },
    });
    expect(quoteBill(rupees(660), paise(0), { ...later, customer: "x".repeat(41) }).tender).toEqual({ ok: false, error: "tooLong" });
    expect(quoteBill(rupees(660), paise(0), { ...later, received: "700", customer: "A" }).receipt).toEqual({ ok: false, error: "moreThanDue" });
    expect(quoteBill(rupees(660), paise(0), { ...empty, method: "cash" }).tender).toEqual({ ok: true, value: { method: "cash" } });
  });

  it("settles only when the payment covers exactly what is left", () => {
    expect(quoteBill(rupees(660), paise(0), { ...empty, method: "upi", received: "660" }).settles).toBe(true);
    expect(quoteBill(rupees(660), paise(0), { ...empty, method: "cash", received: "1000" })).toMatchObject({
      settles: true,
      receipt: { ok: true, value: { amount: rupees(660), change: rupees(340) } },
    });
    expect(quoteBill(rupees(660), paise(0), { ...empty, method: "upi", received: "300" }).settles).toBe(false);
    expect(quoteBill(rupees(660), rupees(300), { ...empty, method: "upi", received: "360" }).settles).toBe(true);
  });

  it("quotes from the discount, never below what was paid", () => {
    expect(quoteBill(rupees(660), paise(0), { ...empty, finalAmount: "600", method: "cash", received: "600" })).toMatchObject({
      due: rupees(600),
      settles: true,
    });
    expect(quoteBill(rupees(660), rupees(300), { ...empty, finalAmount: "200" })).toMatchObject({
      due: rupees(660),
      discount: { ok: false, error: "belowPaid" },
    });
  });

  it("says what is wrong with the amount", () => {
    expect(quoteBill(rupees(660), paise(0), { ...empty, method: "cash" }).receipt).toEqual({ ok: false, error: "empty" });
    expect(quoteBill(rupees(660), paise(0), { ...empty, method: "cash", received: "6oo" }).receipt).toEqual({ ok: false, error: "invalid" });
    expect(quoteBill(rupees(660), paise(0), { ...empty, finalAmount: "9oo", method: "cash", received: "660" }).settles).toBe(false);
  });

  it("shows an overpaid bill as below zero", () => {
    expect(quoteBill(rupees(660), rupees(1320), empty).remaining).toBe(-rupees(660));
  });
});
