import { describe, expect, it } from "vitest";
import { addPaise, fromRupees, multiplyPaise, paise, parseRupees, toRupeeText } from "./money";

describe("money", () => {
  it("converts rupees to whole paise without float drift", () => {
    expect(fromRupees(0.1 + 0.2)).toBe(30);
    expect(fromRupees(12.99)).toBe(1299);
  });

  it("adds and multiplies exactly", () => {
    expect(addPaise(paise(1299), paise(1))).toBe(1300);
    expect(multiplyPaise(paise(1299), 3)).toBe(3897);
  });

  it("allows zero", () => {
    expect(paise(0)).toBe(0);
  });

  it("rejects fractional and negative amounts", () => {
    expect(() => paise(12.5)).toThrow();
    expect(() => paise(-1)).toThrow();
  });
});

describe("parseRupees", () => {
  it("reads what an owner types", () => {
    expect(parseRupees("120")).toBe(12000);
    expect(parseRupees("120.5")).toBe(12050);
    expect(parseRupees(" ₹1,200.75 ")).toBe(120075);
    expect(parseRupees("0")).toBe(0);
  });

  it("rejects typos instead of rounding them", () => {
    for (const text of ["", "12.505", "12abc", "-5", "1e3", ".5", "12."]) {
      expect(parseRupees(text)).toBeUndefined();
    }
  });

  it("round-trips through toRupeeText", () => {
    for (const amount of [0, 5, 12000, 12050, 120075]) {
      expect(parseRupees(toRupeeText(paise(amount)))).toBe(amount);
    }
    expect(toRupeeText(paise(12050))).toBe("120.50");
    expect(toRupeeText(paise(12000))).toBe("120");
  });
});
