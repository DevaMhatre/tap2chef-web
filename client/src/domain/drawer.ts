import { parseRupees, type Paise } from "./money";
import { dayBefore, type BusinessDate } from "./order";
import { err, ok, type Result } from "./result";

/**
 * The cash box, as two facts the owner states: what it started the day with,
 * and what they counted at closing. Each is a record of its own, so two
 * devices stating one each never overwrite the other.
 */
export type DrawerKind = "opening" | "counted";

export type DrawerEntry = {
  /** `opening@2026-10-29`: one per kind per day, so stating it again replaces it. */
  id: string;
  kind: DrawerKind;
  businessDate: BusinessDate;
  amount: Paise;
};

export const drawerEntryId = (kind: DrawerKind, day: BusinessDate): string => `${kind}@${day}`;

export type DrawerError = "badAmount";

/** ₹0 is a real answer (an empty box), so only an unreadable amount is refused. */
export function stateDrawer(kind: DrawerKind, day: BusinessDate, text: string): Result<DrawerEntry, DrawerError> {
  const amount = parseRupees(text);
  if (amount === undefined) return err("badAmount");
  return ok({ id: drawerEntryId(kind, day), kind, businessDate: day, amount });
}

export type DrawerView = {
  /** What the box started with: stated for the day, else what yesterday's count left in it. */
  opening: Paise | undefined;
  /** Whether `opening` was stated today, or carried over from yesterday's count. */
  carried: boolean;
  /** Cash taken minus cash spent that day; may be below zero. */
  movement: number;
  /** What the box should hold; known only once we know what it started with. */
  expected: number | undefined;
  counted: Paise | undefined;
  /** Counted minus expected: below zero is short, above is over. */
  difference: number | undefined;
};

/** Reads the entries of the day and the day before against the day's cash movement. */
export function drawerOf(entries: readonly DrawerEntry[], day: BusinessDate, movement: number): DrawerView {
  const find = (kind: DrawerKind, on: BusinessDate) => entries.find((e) => e.kind === kind && e.businessDate === on)?.amount;
  const stated = find("opening", day);
  const carriedIn = find("counted", dayBefore(day));
  const opening = stated ?? carriedIn;
  const expected = opening === undefined ? undefined : opening + movement;
  const counted = find("counted", day);
  return {
    opening,
    carried: stated === undefined && carriedIn !== undefined,
    movement,
    expected,
    counted,
    difference: counted !== undefined && expected !== undefined ? counted - expected : undefined,
  };
}
