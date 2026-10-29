// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Expense, ExpenseId } from "../domain/expense";
import { paise } from "../domain/money";
import type { BusinessDate } from "../domain/order";
import { fakeClock, fakeExpenseRepository, fakeIds } from "./fakes";
import type { Ports } from "./ports";
import { PortsProvider } from "./PortsProvider";
import { useExpenses, type ReadyExpenses } from "./useExpenses";

const TODAY = "2026-10-29" as BusinessDate;
const rupees = (r: number) => paise(r * 100);
const earlier = (id: string, day: string, note = "Gas"): Expense => ({
  id: id as ExpenseId, amount: rupees(100), method: "cash", note, businessDate: day as BusinessDate, recordedAt: 1,
});

function setup(initial: Expense[] = []) {
  const repo = fakeExpenseRepository({ expenses: initial });
  const ports = {
    expenses: repo.repository,
    ids: fakeIds(),
    clock: fakeClock(new Date(2026, 9, 29, 13, 0).getTime()).clock,
  } as Partial<Ports> as Ports;
  const wrapper = ({ children }: { children: ReactNode }) => <PortsProvider ports={ports}>{children}</PortsProvider>;
  return { repo, ...renderHook(() => useExpenses(), { wrapper }) };
}

const ready = (screen: ReturnType<typeof useExpenses>): ReadyExpenses => {
  if (screen.state !== "ready") throw new Error("Not ready");
  return screen;
};

describe("useExpenses", () => {
  it("lists today first, then earlier days that have something", async () => {
    const { result } = setup([earlier("a", "2026-10-27"), earlier("b", "2026-10-29")]);
    await waitFor(() => expect(result.current.state).toBe("ready"));
    const screen = ready(result.current);
    expect(screen.days.map((d) => d.day)).toEqual(["2026-10-29", "2026-10-27"]);
    expect(screen.entryDays).toEqual([TODAY, "2026-10-28"]);
  });

  it("shows today even when nothing is noted", async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.state).toBe("ready"));
    expect(ready(result.current).days).toMatchObject([{ day: TODAY, expenses: [] }]);
  });

  it("notes an expense once, however many times it is tapped, and undo takes it away", async () => {
    const { result, repo } = setup();
    await waitFor(() => expect(result.current.state).toBe("ready"));
    const id = ready(result.current).newId();
    const input = { amount: "340", method: "cash" as const, note: " Vegetables ", day: TODAY };

    let results: Awaited<ReturnType<ReadyExpenses["note"]>>[] = [];
    await act(async () => {
      results = await Promise.all([ready(result.current).note(id, input), ready(result.current).note(id, input)]);
    });
    expect(results.every((r) => r.ok)).toBe(true);
    expect(repo.writes).toHaveLength(1);
    expect(repo.current().expenses).toMatchObject([{ id, note: "Vegetables", amount: rupees(340) }]);
    expect(ready(result.current).days[0]!.spent.total).toBe(rupees(340));

    const first = results[0]!;
    if (!first.ok) throw new Error("expected ok");
    await act(async () => first.value.undo());
    expect(repo.current().expenses).toEqual([]);
  });

  it("refuses what the rules refuse, writing nothing", async () => {
    const { result, repo } = setup();
    await waitFor(() => expect(result.current.state).toBe("ready"));
    const screen = ready(result.current);
    const bad = await screen.note(screen.newId(), { amount: "0", method: "cash", note: "Gas", day: TODAY });
    expect(bad).toEqual({ ok: false, error: "zero" });
    expect(repo.writes).toEqual([]);
    expect(await screen.note(screen.newId(), { amount: "3x", method: "cash", note: "Gas", day: TODAY })).toEqual({ ok: false, error: "badAmount" });
    expect(await screen.note(screen.newId(), { amount: "30", method: null, note: "Gas", day: TODAY })).toEqual({ ok: false, error: "noMethod" });
    expect(repo.writes).toEqual([]);
  });

  it("removes an expense, keeps it listed, and undo counts it again", async () => {
    const { result, repo } = setup([earlier("a", "2026-10-29")]);
    await waitFor(() => expect(result.current.state).toBe("ready"));

    let removal!: Awaited<ReturnType<ReadyExpenses["remove"]>>;
    await act(async () => {
      removal = await ready(result.current).remove("a" as ExpenseId);
    });
    if (!removal.ok) throw new Error("expected ok");
    expect(repo.current().expenses[0]!.removedAt).toBeGreaterThan(0);
    expect(ready(result.current).days[0]).toMatchObject({ spent: { total: 0 }, expenses: [{ id: "a" }] });

    await act(async () => removal.ok && removal.value());
    expect(repo.current().expenses[0]!.removedAt).toBeUndefined();
    expect(ready(result.current).days[0]!.spent.total).toBe(rupees(100));
  });

  it("says so for an expense that is gone or already removed", async () => {
    const { result } = setup([{ ...earlier("a", "2026-10-29"), removedAt: 5 }]);
    await waitFor(() => expect(result.current.state).toBe("ready"));
    const screen = ready(result.current);
    expect(await screen.remove("a" as ExpenseId)).toEqual({ ok: false, error: "removed" });
    expect(await screen.remove("zzz" as ExpenseId)).toEqual({ ok: false, error: "missing" });
  });

  it("learns suggestions from earlier notes", async () => {
    const { result } = setup([earlier("a", "2026-10-28", "Milk"), earlier("b", "2026-10-29", "Milk"), earlier("c", "2026-10-29", "Gas")]);
    await waitFor(() => expect(result.current.state).toBe("ready"));
    expect(ready(result.current).suggestions).toEqual(["Milk", "Gas"]);
  });
});
