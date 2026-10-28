import { describe, expect, it } from "vitest";
import { paise } from "./money";
import { amountDue, discountTo, quoteBill, receiptFor, takings, type BillInput } from "./settlement";

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
    expect(takings(payments)).toEqual({ total: rupees(1170), cash: rupees(780), upi: rupees(390) });
    expect(takings([])).toEqual({ total: 0, cash: 0, upi: 0 });
  });
});

describe("quoteBill", () => {
  const empty: BillInput = { finalAmount: "", reason: "", method: null, received: "" };

  it("is the whole bill, and no payment until a method is chosen", () => {
    expect(quoteBill(rupees(660), paise(0), empty)).toEqual({
      subtotal: rupees(660),
      due: rupees(660),
      discount: { ok: true, value: undefined },
      paid: 0,
      remaining: rupees(660),
      receipt: null,
      settles: false,
    });
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
