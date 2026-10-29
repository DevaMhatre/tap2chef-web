import { useEffect, useState } from "react";
import { dayNumbers, type DayNumbers } from "../domain/dayBook";
import { drawerOf, stateDrawer, type DrawerError, type DrawerKind, type DrawerView } from "../domain/drawer";
import { businessDate, dayAfter, dayBefore, type BusinessDate } from "../domain/order";
import type { Result } from "../domain/result";
import type { Undo } from "./menuEditor";
import type { DaySnapshot } from "./ports";
import { usePorts } from "./PortsProvider";

export type Day =
  | { state: "loading"; day: BusinessDate; today: BusinessDate }
  | {
      state: "ready";
      day: BusinessDate;
      today: BusinessDate;
      isToday: boolean;
      numbers: DayNumbers;
      /** The cash box: what it started with, should hold and was counted at. */
      drawer: DrawerView;
      /** State what the box started with, or what was counted in it; replaces an earlier answer. */
      stateDrawer(kind: DrawerKind, amount: string): Promise<Result<Undo, DrawerError>>;
      /** null at today: there is no tomorrow to look at. */
      next: BusinessDate | null;
      previous: BusinessDate;
    };

/** The numbers of one trading day; `chosen` null means today. */
export function useDayNumbers(chosen: BusinessDate | null): Day {
  const { days, drawer, clock } = usePorts();
  const today = businessDate(clock.now());
  const day = chosen !== null && chosen < today ? chosen : today;
  const [loaded, setLoaded] = useState<{ day: BusinessDate; snapshot: DaySnapshot } | null>(null);
  useEffect(() => days.subscribe(day, (snapshot) => setLoaded({ day, snapshot })), [days, day]);

  // A snapshot of another day (just changed) is not this day's numbers.
  if (!loaded || loaded.day !== day) return { state: "loading", day, today };
  const { orders, lines, payments, expenses, drawer: entries } = loaded.snapshot;
  const numbers = dayNumbers(day, orders, lines, payments, expenses);
  return {
    state: "ready",
    day,
    today,
    isToday: day === today,
    numbers,
    drawer: drawerOf(entries, day, numbers.drawer),
    // The entry's id is fixed by kind and day, so a double tap writes the same record twice.
    async stateDrawer(kind, amount) {
      const entry = stateDrawer(kind, day, amount);
      if (!entry.ok) return entry;
      const before = entries.find((e) => e.id === entry.value.id);
      await drawer.write([{ table: "drawer", record: entry.value, op: "put" }]);
      // Undo puts back the earlier answer, or takes the first one away.
      const undo: Undo = () =>
        drawer.write([before ? { table: "drawer", record: before, op: "put" } : { table: "drawer", record: entry.value, op: "remove" }]);
      return { ok: true, value: undo };
    },
    next: day === today ? null : dayAfter(day),
    previous: dayBefore(day),
  };
}
