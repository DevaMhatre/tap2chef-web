// @vitest-environment jsdom
import type { ReactNode } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Expense, ExpenseId } from "../domain/expense";
import { paise } from "../domain/money";
import type { BusinessDate } from "../domain/order";
import type { DrawerEntry } from "../domain/drawer";
import { fakeClock, fakeDayRepository, fakeDrawerRepository } from "./fakes";
import type { Ports } from "./ports";
import { PortsProvider } from "./PortsProvider";
import { useDayNumbers, type Day } from "./useDayNumbers";

const day = (d: string) => d as BusinessDate;
const spend = (d: string): Expense => ({ id: "e" as ExpenseId, amount: paise(5000), method: "cash", note: "Gas", businessDate: day(d), recordedAt: 1 });

const counted = (d: string, amount: number): DrawerEntry => ({ id: `counted@${d}`, kind: "counted", businessDate: day(d), amount: paise(amount) });

function setup(chosen: BusinessDate | null) {
  const days = fakeDayRepository({
    "2026-10-29": { expenses: [spend("2026-10-29")], drawer: [counted("2026-10-28", 80000)] },
    "2026-10-28": { expenses: [spend("2026-10-28"), spend("2026-10-28")] },
  });
  const drawer = fakeDrawerRepository();
  const ports = { days: days.repository, drawer: drawer.repository, clock: fakeClock(new Date(2026, 9, 29, 13, 0).getTime()).clock } as Partial<Ports> as Ports;
  const wrapper = ({ children }: { children: ReactNode }) => <PortsProvider ports={ports}>{children}</PortsProvider>;
  return { days, drawer, ...renderHook(({ at }) => useDayNumbers(at), { wrapper, initialProps: { at: chosen } }) };
}

const ready = (d: Day) => {
  if (d.state !== "ready") throw new Error("Not ready");
  return d;
};

describe("useDayNumbers", () => {
  it("reads today when none is chosen, with no day after it", async () => {
    const { result } = setup(null);
    expect(result.current.state).toBe("loading");
    await waitFor(() => expect(result.current.state).toBe("ready"));
    const today = ready(result.current);
    expect(today).toMatchObject({ day: "2026-10-29", isToday: true, next: null, previous: "2026-10-28" });
    expect(today.numbers.spent.total).toBe(5000);
  });

  it("reads an earlier day, and steps back to today from it", async () => {
    const { result } = setup(day("2026-10-28"));
    await waitFor(() => expect(result.current.state).toBe("ready"));
    expect(ready(result.current)).toMatchObject({ isToday: false, next: "2026-10-29", previous: "2026-10-27" });
    expect(ready(result.current).numbers.spent.total).toBe(10000);
  });

  it("never looks past today", async () => {
    const { result, days } = setup(day("2027-01-01"));
    await waitFor(() => expect(result.current.state).toBe("ready"));
    expect(ready(result.current).day).toBe("2026-10-29");
    expect(days.asked).toEqual(["2026-10-29"]);
  });

  it("shows loading, not the old day's numbers, while another day loads", async () => {
    const { result, rerender } = setup(null);
    await waitFor(() => expect(result.current.state).toBe("ready"));
    rerender({ at: day("2026-10-28") });
    expect(result.current).toMatchObject({ state: "loading", day: "2026-10-28" });
    await waitFor(() => expect(result.current.state).toBe("ready"));
  });

  it("carries yesterday's count in as today's start, and compares a count to what it should be", async () => {
    const { result } = setup(null);
    await waitFor(() => expect(result.current.state).toBe("ready"));
    // ₹800 carried in, ₹50 of cash spent today, nothing taken.
    expect(ready(result.current).drawer).toMatchObject({ opening: 80000, carried: true, expected: 75000, counted: undefined });
  });

  it("states the opening or the count as one replaceable record, and refuses an unreadable amount", async () => {
    const { result, drawer } = setup(null);
    await waitFor(() => expect(result.current.state).toBe("ready"));
    const today = ready(result.current);
    expect(await today.stateDrawer("counted", "7.5.0")).toEqual({ ok: false, error: "badAmount" });
    expect(drawer.writes).toEqual([]);

    await Promise.all([today.stateDrawer("opening", "1,500"), today.stateDrawer("opening", "1,500")]);
    expect(drawer.writes.flat().map((w) => w.record)).toEqual([
      { id: "opening@2026-10-29", kind: "opening", businessDate: "2026-10-29", amount: 150000 },
      { id: "opening@2026-10-29", kind: "opening", businessDate: "2026-10-29", amount: 150000 },
    ]);
  });

  it("undoes a restated amount back to the earlier one, and a first one away", async () => {
    const { result, drawer } = setup(null);
    await waitFor(() => expect(result.current.state).toBe("ready"));
    const first = await ready(result.current).stateDrawer("counted", "700");
    if (!first.ok) throw new Error("expected ok");
    await first.value();
    expect(drawer.writes.at(-1)).toMatchObject([{ op: "remove", record: { id: "counted@2026-10-29" } }]);
  });
});
