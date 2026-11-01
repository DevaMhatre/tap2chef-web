import { describe, expect, it } from "vitest";
import { knownNow, kotStatus, kotForCancel, kotForRound, kotJobs, kotLayout, kotTally, kotTitle, nextKotNumber, ROW_WIDTH, wrap, type KotPrint } from "./kot";
import type { ItemId, ProfileId } from "./menu";
import { paise } from "./money";
import type { BusinessDate, LineId, Order, OrderId, OrderLine, Round, RoundId } from "./order";

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

describe("kotLayout", () => {
  it("is the slip the kitchen reads: KOT number and time, where, the dishes with HALF and (qty), notes, who", () => {
    const kot = { ...kotForRound("Table 4", round(1, [line("Chicken Biryani", { quantity: 2, portion: "Half", note: "less spicy" })]), "Ravi"), number: 14 };
    expect(kotLayout(kot, "7:04 pm")).toEqual([
      { text: "KOT 14                   7:04 pm", style: "small" },
      { text: "Table 4", style: "title" },
      { text: "Chicken Biryani HALF (2)", style: "dish" },
      { text: "  > less spicy", style: "note" },
      { text: "Ravi", style: "small" },
    ]);
  });

  it("shows just the time on a slip without a number yet", () => {
    expect(kotLayout(kotForRound("Table 4", round(1, [line("Tea")])), "7:04 pm")[0]!.text.trim()).toBe("7:04 pm");
  });

  it("fits every row to its width; says a later round adds; a cancel and a reprint are banners", () => {
    const long = kotLayout(kotForRound("Table 4", round(1, [line("Chicken Biryani Hyderabadi Dum Special")])), "7:04 pm");
    expect(long.filter((r) => r.style === "dish").map((r) => r.text)).toEqual(["Chicken Biryani Hyderabadi Dum", "  Special (1)"]);
    expect(long.every((r) => r.text.length <= ROW_WIDTH[r.style])).toBe(true);
    expect(kotLayout(kotForRound("Parcel 3", round(2, [line("Tea")])), "2:00 pm").map((r) => r.text)).toContain("Round 2 - adding");
    const cancelled = line("Tea", { state: { status: "voided", roundId: r1, sentAt: 1, voidedAt: 2 } });
    const cancel = kotForCancel("Parcel 3", 1, cancelled as OrderLine & { state: { status: "voided"; voidedAt: number } });
    expect(kotLayout({ ...cancel, reprint: true }, "2:01 pm").filter((r) => r.style === "banner").map((r) => r.text)).toEqual(["CANCEL", "REPRINT"]);
  });
});

describe("printing by itself", () => {
  const DAY = "2026-11-01" as BusinessDate;
  const order = (id: string, status: "open" | "settled" = "open"): Order => ({
    id: id as OrderId,
    channel: { type: "takeaway", token: 1 },
    profileId: "p" as ProfileId,
    businessDate: DAY,
    openedAt: 1,
    state: status === "open" ? { status: "open" } : { status: "settled", billedAt: 2, settledAt: 3, subtotal: paise(0) },
  });
  const sent = (id: string, orderId: string, roundId: string, sentAt: number, over: Partial<OrderLine> = {}): OrderLine =>
    line(id, { orderId: orderId as OrderId, state: { status: "sent", roundId: roundId as RoundId, sentAt }, ...over });
  const printed = (id: string, number: number, orderId = "o1", kind: KotPrint["kind"] = "round"): KotPrint => ({ id, orderId: orderId as OrderId, businessDate: DAY, number, kind, printedAt: 1 });

  it("prints each round once, oldest first, and a paid parcel too", () => {
    const orders = [order("o1"), order("o2", "settled")];
    const lines = [sent("a", "o1", "r1", 10), sent("b", "o2", "r2", 5), sent("c", "o1", "r3", 20)];
    expect(kotJobs(orders, lines, [], new Set()).map((j) => j.id)).toEqual(["round:r2", "round:r1", "round:r3"]);
    expect(kotJobs(orders, lines, [printed("round:r2", 1)], new Set()).map((j) => j.id)).toEqual(["round:r1", "round:r3"]);
  });

  it("never prints what existed when printing was turned on", () => {
    const orders = [order("o1")];
    const before = [sent("a", "o1", "r1", 10)];
    const known = knownNow(orders, before);
    expect(kotJobs(orders, [...before, sent("b", "o1", "r2", 20)], [], known).map((j) => j.id)).toEqual(["round:r2"]);
  });

  it("prints a cancel only for a dish the kitchen had; a round cancelled whole before printing prints nothing", () => {
    const voided = (id: string, roundId: string) => sent(id, "o1", roundId, 10, { state: { status: "voided", roundId: roundId as RoundId, sentAt: 10, voidedAt: 30 } });
    const lines = [voided("a", "r1"), sent("b", "o1", "r1", 10), voided("c", "r2")];
    expect(kotJobs([order("o1")], lines, [printed("round:r1", 1)], new Set()).map((j) => j.id)).toEqual(["cancel:a"]);
  });

  it("numbers KOTs from 1 each trading day", () => {
    expect(nextKotNumber([], DAY)).toBe(1);
    expect(nextKotNumber([printed("x", 4), { ...printed("y", 9), businessDate: "2026-10-31" as BusinessDate }], DAY)).toBe(5);
  });

  it("tallies the day for the owner: the range, the cancels, and the KOTs whose bill isn't paid", () => {
    const lines = [sent("a", "o1", "r1", 1), sent("b", "o2", "r2", 1), sent("c", "o2", "r9", 2)];
    const prints = [printed("round:r1", 1, "o1"), printed("round:r2", 2, "o2"), printed("cancel:x", 3, "o2", "cancel"), printed("round:r9", 4, "o2")];
    const tally = kotTally(prints, [order("o1", "settled"), order("o2")], lines, DAY);
    expect(tally).toMatchObject({ count: 4, first: 1, last: 4, cancels: 1 });
    // Two rounds at one table are one bill.
    expect(tally.unpaid.map((p) => p.number)).toEqual([2]);
  });

  it("never calls an order whose every dish was cancelled unpaid, and finds an order from the day before", () => {
    const voided = sent("a", "o1", "r1", 1, { state: { status: "voided", roundId: "r1" as RoundId, sentAt: 1, voidedAt: 2 } });
    expect(kotTally([printed("round:r1", 1, "o1")], [order("o1")], [voided], DAY).unpaid).toEqual([]);
    const yesterday = { ...order("o9"), businessDate: "2026-10-31" as BusinessDate };
    expect(kotTally([printed("round:r9", 1, "o9")], [yesterday], [sent("z", "o9", "r9", 1)], DAY).unpaid.map((p) => p.number)).toEqual([1]);
  });

  it("prints no CANCEL for a dish cancelled before its round printed (the slip left it off)", () => {
    const voided = (id: string) => sent(id, "o1", "r1", 10, { state: { status: "voided", roundId: "r1" as RoundId, sentAt: 10, voidedAt: 30 } });
    const lines = [sent("a", "o1", "r1", 10), voided("naan"), voided("later")];
    const round = { ...printed("round:r1", 1), cancelledBefore: ["naan"] };
    expect(kotJobs([order("o1")], lines, [round], new Set()).map((j) => j.id)).toEqual(["cancel:later"]);
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
    expect(kotTitle({ kind: "token", token: 12 })).toBe("Parcel 12");
  });
});

describe("kotStatus", () => {
  const print = { id: "round:r1", orderId: "o" as OrderId, businessDate: "2026-11-01" as BusinessDate, number: 14, kind: "round" as const, printedAt: 1 };
  const other = { ...print, id: "round:other", number: 13 };
  it("says the KOT number once printed; offline in a restaurant that prints, says the kitchen hasn't got it", () => {
    expect(kotStatus({ id: "r1" as RoundId }, [print], false)).toEqual({ kind: "printed", number: 14 });
    expect(kotStatus({ id: "r1" as RoundId }, [other], false)).toEqual({ kind: "offline" });
    // Online and not printed: it may have been sent before printing began. Nothing is guessed.
    expect(kotStatus({ id: "r1" as RoundId }, [other], true)).toEqual({ kind: "none" });
  });
  it("says nothing in a restaurant that prints no KOTs", () => {
    expect(kotStatus({ id: "r1" as RoundId }, [], false)).toEqual({ kind: "none" });
  });
});
