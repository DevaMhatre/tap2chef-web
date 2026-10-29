import { describe, expect, it } from "vitest";
import { drawerEntryId, drawerOf, stateDrawer, type DrawerEntry } from "./drawer";
import { paise } from "./money";
import type { BusinessDate } from "./order";

const rupees = (r: number) => paise(r * 100);
const DAY = "2026-10-29" as BusinessDate;
const YESTERDAY = "2026-10-28" as BusinessDate;
const entry = (kind: DrawerEntry["kind"], day: BusinessDate, amount: number): DrawerEntry => ({
  id: drawerEntryId(kind, day), kind, businessDate: day, amount: rupees(amount),
});

describe("stateDrawer", () => {
  it("reads the amount strictly, with an id that makes stating it again a replacement", () => {
    expect(stateDrawer("opening", DAY, "₹1,500")).toEqual({
      ok: true,
      value: { id: "opening@2026-10-29", kind: "opening", businessDate: DAY, amount: rupees(1500) },
    });
    expect(stateDrawer("counted", DAY, "0")).toMatchObject({ ok: true, value: { amount: 0 } });
    expect(stateDrawer("counted", DAY, "12.505")).toEqual({ ok: false, error: "badAmount" });
    expect(stateDrawer("counted", DAY, "")).toEqual({ ok: false, error: "badAmount" });
  });
});

describe("drawerOf", () => {
  it("does not know what the box should hold until it knows what it started with", () => {
    expect(drawerOf([], DAY, rupees(200))).toEqual({
      opening: undefined, carried: false, movement: rupees(200), expected: undefined, counted: undefined, difference: undefined,
    });
  });

  it("adds the day's cash to what the box started with", () => {
    const view = drawerOf([entry("opening", DAY, 500)], DAY, rupees(200));
    expect(view).toMatchObject({ opening: rupees(500), carried: false, expected: rupees(700), difference: undefined });
  });

  it("carries yesterday's count in when nothing is stated today", () => {
    const view = drawerOf([entry("counted", YESTERDAY, 800)], DAY, -10000);
    expect(view).toMatchObject({ opening: rupees(800), carried: true, expected: rupees(700) });
  });

  it("prefers what was stated today over the carried amount", () => {
    const view = drawerOf([entry("counted", YESTERDAY, 800), entry("opening", DAY, 300)], DAY, 0);
    expect(view).toMatchObject({ opening: rupees(300), carried: false });
  });

  it("says short, over or matching once counted", () => {
    const open = entry("opening", DAY, 500);
    expect(drawerOf([open, entry("counted", DAY, 680)], DAY, rupees(200)).difference).toBe(-rupees(20));
    expect(drawerOf([open, entry("counted", DAY, 720)], DAY, rupees(200)).difference).toBe(rupees(20));
    expect(drawerOf([open, entry("counted", DAY, 700)], DAY, rupees(200)).difference).toBe(0);
  });

  it("shows a count with nothing to compare it to when the start is unknown", () => {
    const view = drawerOf([entry("counted", DAY, 700)], DAY, rupees(200));
    expect(view).toMatchObject({ counted: rupees(700), expected: undefined, difference: undefined });
  });

  it("ignores another day's entries", () => {
    expect(drawerOf([entry("opening", YESTERDAY, 500), entry("counted", "2026-10-27" as BusinessDate, 9)], DAY, 0).opening).toBeUndefined();
  });
});
