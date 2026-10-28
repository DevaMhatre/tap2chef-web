import type { StoredRecord } from "./db";

// Records can arrive from other devices through sync, so adapters check them
// on read and skip malformed ones rather than trusting them.

export const isText = (value: unknown): value is string => typeof value === "string" && value !== "";
export const isPaise = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
export const isTime = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0;
export const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

export function readAll<T>(rows: StoredRecord[], parse: (r: StoredRecord) => T | undefined, table: string): T[] {
  return rows.flatMap((row) => {
    if (row.deleted) return [];
    const parsed = parse(row);
    if (!parsed) console.warn(`Skipping malformed ${table} record`, row.id);
    return parsed ? [parsed] : [];
  });
}
