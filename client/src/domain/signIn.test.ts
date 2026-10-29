import { describe, expect, it } from "vitest";
import { codeDigits, readEmail, readRestaurantName } from "./signIn";

describe("readEmail", () => {
  it("tidies what was typed", () => {
    expect(readEmail("  Owner@Example.COM ")).toEqual({ ok: true, value: "owner@example.com" });
  });

  it("refuses what can't be an email", () => {
    for (const bad of ["", "owner", "owner@", "@example.com", "owner@example", "a b@example.com"]) {
      expect(readEmail(bad)).toEqual({ ok: false, error: "badEmail" });
    }
  });
});

describe("codeDigits", () => {
  it("keeps the digits of a pasted code, six at most", () => {
    expect(codeDigits("123 456")).toBe("123456");
    expect(codeDigits("Code: 12-34-56-78")).toBe("123456");
    expect(codeDigits("12a")).toBe("12");
  });
});

describe("readRestaurantName", () => {
  it("takes a name, tidied", () => {
    expect(readRestaurantName("  Sharma   Dhaba ")).toEqual({ ok: true, value: "Sharma Dhaba" });
  });

  it("refuses an empty or very long name", () => {
    expect(readRestaurantName("   ")).toEqual({ ok: false, error: "empty" });
    expect(readRestaurantName("x".repeat(61))).toEqual({ ok: false, error: "tooLong" });
  });
});
