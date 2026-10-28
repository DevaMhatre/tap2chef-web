import { describe, expect, it } from "vitest";
import { addPaise, fromRupees, multiplyPaise, paise } from "./money";

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
