import type { Id } from "./menu";

export type TableId = Id<"TableId">;

/** A table in this shop. The name is what staff call it: "4", "Garden 2". */
export type DiningTable = { id: TableId; name: string; sortKey: string };

// Short, because a name has to fit a tile on a 360px phone.
export const TABLE_NAME_MAX = 12;

/** Setup is one question, "How many tables?". */
export const TABLE_COUNT = { min: 1, max: 60, suggested: 6 } as const;

export function isTableCount(count: number): boolean {
  return Number.isInteger(count) && count >= TABLE_COUNT.min && count <= TABLE_COUNT.max;
}

/** Setup names tables the way most restaurants already do: 1, 2, 3… */
export function numberedTables(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `${i + 1}`);
}

/** One more table: the next number after the highest numbered one. */
export function nextTableName(tables: readonly DiningTable[]): string {
  const numbers = tables.map((t) => (/^\d+$/.test(t.name) ? Number(t.name) : 0));
  return `${Math.max(0, ...numbers) + 1}`;
}
