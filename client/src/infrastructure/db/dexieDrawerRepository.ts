import { drawerEntryId, type DrawerEntry } from "../../domain/drawer";
import type { Paise } from "../../domain/money";
import type { BusinessDate } from "../../domain/order";
import type { DrawerChange, DrawerRepository } from "../../usecases/ports";
import type { StoredRecord } from "./db";
import { isPaise } from "./parse";
import { writeAll } from "./repo";

// Anti-corruption layer between stored records and the cash-drawer domain.

const isDate = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

export function toDrawerEntry(r: StoredRecord): DrawerEntry | undefined {
  if ((r.kind !== "opening" && r.kind !== "counted") || !isDate(r.businessDate) || !isPaise(r.amount)) return undefined;
  const day = r.businessDate as BusinessDate;
  // The id carries kind and day: a row stored under another id would never be replaced.
  if (r.id !== drawerEntryId(r.kind, day)) return undefined;
  return { id: r.id, kind: r.kind, businessDate: day, amount: r.amount as Paise };
}

export const dexieDrawerRepository: DrawerRepository = {
  write: (changes: readonly DrawerChange[]) =>
    writeAll(changes.map((c) => ({ table: "drawerEntries" as const, record: c.record, op: c.op }))),
};
