import { describe, expect, it } from "vitest";
import { kotForCancel, kotForRound, kotText, kotTitle, wrap } from "./kot";
import type { ItemId } from "./menu";
import { paise } from "./money";
import type { LineId, OrderId, OrderLine, Round, RoundId } from "./order";

const r1 = "r1" as RoundId;
const line = (name: string, over: Partial<OrderLine> = {}): OrderLine => ({
  id: name as LineId,
  orderId: "o" as OrderId,
  itemId: name as ItemId,
  name,
  diet: "veg",
  unitPrice: paise(10000),
  quantity: 1,
  note: "",
  addedAt: 1,
  state: { status: "sent", roundId: r1, sentAt: 100 },
  ...over,
});
const round = (number: number, lines: OrderLine[]): Round => ({ id: r1, number, sentAt: 100, lines });

describe("kotForRound", () => {
  it("lists what the kitchen cooks: no prices, no cancelled dish", () => {
    const kot = kotForRound("Table 4", round(1, [
      line("Chicken Biryani", { quantity: 2, portion: "Half", note: "less spicy" }),
      line("Butter Naan", { state: { status: "voided", roundId: r1, sentAt: 100, voidedAt: 120 } }),
    ]), "Ravi");
    expect(kot).toEqual({
      title: "Table 4",
      kind: "round",
      round: 1,
      at: 100,
      by: "Ravi",
      lines: [{ quantity: 2, name: "Chicken Biryani", portion: "Half", note: "less spicy" }],
    });
  });
});

describe("kotForCancel", () => {
  it("is a slip of its own for a dish the kitchen must stop", () => {
    const cancelled = line("Butter Naan", { quantity: 1, state: { status: "voided", roundId: r1, sentAt: 100, voidedAt: 130, by: "Asha" } });
    expect(kotForCancel("Table 4", 2, cancelled as OrderLine & { state: { status: "voided"; voidedAt: number } })).toMatchObject({
      kind: "cancel",
      round: 2,
      at: 130,
      by: "Asha",
      lines: [{ quantity: 1, name: "Butter Naan" }],
    });
  });
});

describe("kotText", () => {
  it("fits a 58 mm roll: quantity first, HALF in capitals, the note under its dish", () => {
    const kot = kotForRound("Table 4", round(1, [line("Chicken Biryani Hyderabadi Dum Special", { quantity: 2, portion: "Half", note: "less spicy" })]), "Ravi");
    const text = kotText(kot, "1:42 pm");
    expect(text).toEqual([
      "New order",
      "1:42 pm  by Ravi",
      "-".repeat(32),
      "2 x Chicken Biryani Hyderabadi",
      "    Dum Special HALF",
      "    > less spicy",
      "-".repeat(32),
    ]);
    expect(text.every((l) => l.length <= 32)).toBe(true);
  });

  it("says a later round adds, and a cancel says CANCEL", () => {
    expect(kotText(kotForRound("Token 3", round(2, [line("Tea")])), "2:00 pm")[0]).toBe("Round 2 - adding");
    const cancelled = line("Tea", { state: { status: "voided", roundId: r1, sentAt: 1, voidedAt: 2 } });
    expect(kotText(kotForCancel("Token 3", 1, cancelled as OrderLine & { state: { status: "voided"; voidedAt: number } }), "2:01 pm")[0]).toBe("CANCEL");
  });
});

describe("wrap", () => {
  it("breaks at spaces, and cuts a word longer than the line", () => {
    expect(wrap("Paneer Butter Masala", 10)).toEqual(["Paneer", "Butter", "Masala"]);
    expect(wrap("Supercalifragilistic", 8)).toEqual(["Supercal", "ifragili", "stic"]);
    expect(wrap("  a  b ", 5)).toEqual(["a b"]);
  });
});

describe("kotTitle", () => {
  it("names the table or the token in plain letters", () => {
    expect(kotTitle({ kind: "table", name: "4" })).toBe("Table 4");
    expect(kotTitle({ kind: "table", name: "Garden" })).toBe("Garden");
    expect(kotTitle({ kind: "token", token: 12 })).toBe("Takeaway - Token 12");
  });
});
