import { describe, expect, it } from "vitest";
import { paise } from "./money";
import {
  amountDue,
  changeFor,
  discountTo,
  fullPayment,
  splitPayment,
  tenderOptions,
  validateBill,
  type Payment,
} from "./settlement";

const rupees = (r: number) => paise(r * 100);
const cash = (r: number): Payment => ({ method: "cash", amount: rupees(r) });
const upi = (r: number): Payment => ({ method: "upi", amount: rupees(r) });

describe("discountTo", () => {
  it("turns the final amount into a discount", () => {
    expect(discountTo(rupees(890), rupees(850), "  Regular  ")).toEqual({
      ok: true,
      value: { amount: rupees(40), reason: "Regular" },
    });
    expect(amountDue(rupees(890), { amount: rupees(40), reason: "" })).toBe(rupees(850));
  });

  it("is no discount when the amount is unchanged", () => {
    expect(discountTo(rupees(890), rupees(890))).toEqual({ ok: true, value: undefined });
  });

  it("allows on the house, never upward", () => {
    expect(discountTo(rupees(890), rupees(0))).toMatchObject({ ok: true, value: { amount: rupees(890) } });
    expect(discountTo(rupees(890), rupees(900))).toEqual({ ok: false, error: "upward" });
  });

  it("keeps the reason short", () => {
    expect(discountTo(rupees(890), rupees(850), "x".repeat(81))).toEqual({ ok: false, error: "tooLong" });
  });
});

describe("validateBill", () => {
  const subtotal = rupees(890);

  it("settles only when payments sum exactly to what is due", () => {
    expect(validateBill({ subtotal, payments: [cash(500), upi(390)] }).ok).toBe(true);
    expect(validateBill({ subtotal, payments: [cash(500), upi(389)] })).toEqual({ ok: false, error: "notExact" });
    expect(validateBill({ subtotal, payments: [cash(900)] })).toEqual({ ok: false, error: "notExact" });
    expect(validateBill({ subtotal, payments: [] })).toEqual({ ok: false, error: "notExact" });
  });

  it("counts the discount, which can't exceed the bill", () => {
    const discount = { amount: rupees(40), reason: "" };
    expect(validateBill({ subtotal, discount, payments: [upi(850)] }).ok).toBe(true);
    expect(validateBill({ subtotal, discount: { amount: rupees(891), reason: "" }, payments: [] })).toEqual({
      ok: false,
      error: "discountTooLarge",
    });
    expect(validateBill({ subtotal, discount: { amount: paise(0), reason: "" }, payments: [cash(890)] })).toEqual({
      ok: false,
      error: "discountTooLarge",
    });
  });

  it("settles a ₹0 bill with no payments, and refuses ₹0 payments", () => {
    expect(validateBill({ subtotal: paise(0), payments: [] }).ok).toBe(true);
    expect(validateBill({ subtotal, discount: { amount: subtotal, reason: "On the house" }, payments: [] }).ok).toBe(true);
    expect(validateBill({ subtotal, payments: [cash(890), upi(0)] })).toEqual({ ok: false, error: "zeroPayment" });
  });
});

describe("paying", () => {
  it("pays in full with one method, or nothing for ₹0", () => {
    expect(fullPayment("upi", rupees(890))).toEqual([upi(890)]);
    expect(fullPayment("cash", paise(0))).toEqual([]);
  });

  it("splits: the cash typed, UPI the rest, exact by construction", () => {
    expect(splitPayment(rupees(890), rupees(500))).toEqual({ ok: true, value: [cash(500), upi(390)] });
    expect(splitPayment(paise(89050), paise(50001))).toEqual({
      ok: true,
      value: [
        { method: "cash", amount: 50001 },
        { method: "upi", amount: 39049 },
      ],
    });
  });

  it("drops an empty side of a split, and refuses more cash than due", () => {
    expect(splitPayment(rupees(890), rupees(890))).toEqual({ ok: true, value: [cash(890)] });
    expect(splitPayment(rupees(890), paise(0))).toEqual({ ok: true, value: [upi(890)] });
    expect(splitPayment(rupees(890), rupees(891))).toEqual({ ok: false, error: "moreThanDue" });
  });
});

describe("change", () => {
  it("offers the round amounts a guest hands over", () => {
    expect(tenderOptions(rupees(890))).toEqual([rupees(900), rupees(1000), rupees(2000)]);
    expect(tenderOptions(rupees(360))).toEqual([rupees(400), rupees(500), rupees(1000)]);
    expect(tenderOptions(rupees(1240))).toEqual([rupees(1300), rupees(1500), rupees(2000)]);
    expect(tenderOptions(paise(4550))).toEqual([rupees(50), rupees(100), rupees(500)]);
  });

  it("offers only amounts above the bill, and nothing for ₹0", () => {
    expect(tenderOptions(rupees(500))).toEqual([rupees(550), rupees(600), rupees(1000)]);
    expect(tenderOptions(paise(0))).toEqual([]);
  });

  it("works out the change", () => {
    expect(changeFor(rupees(890), rupees(1000))).toBe(rupees(110));
    expect(changeFor(rupees(890), rupees(890))).toBe(0);
    expect(changeFor(rupees(890), rupees(500))).toBeUndefined();
  });
});
