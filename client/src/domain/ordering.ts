// Fractional sort keys: moving a record between two others rewrites only that
// record. Integer positions would rewrite every sibling, which means more
// outbox traffic and more last-write-wins conflicts between devices.

const DIGITS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

export type Ordered = { id: string; sortKey: string };
export type KeyChange = { id: string; sortKey: string };

// Code-unit comparison, never localeCompare: every device must agree on the
// order. Equal keys (two devices appending while offline) fall back to id.
export function compareOrder(a: Ordered, b: Ordered): number {
  if (a.sortKey !== b.sortKey) return a.sortKey < b.sortKey ? -1 : 1;
  if (a.id !== b.id) return a.id < b.id ? -1 : 1;
  return 0;
}

export function sortByOrder<T extends Ordered>(records: readonly T[]): T[] {
  return [...records].sort(compareOrder);
}

// A trailing "0" is invalid because nothing fits between "1" and "10".
export function isValidKey(key: string): boolean {
  return key !== "" && !key.endsWith("0") && [...key].every((c) => DIGITS.includes(c));
}

/** A key strictly between `before` and `after`; a missing end is open. */
export function keyBetween(before?: string, after?: string): string {
  for (const key of [before, after]) {
    if (key !== undefined && !isValidKey(key)) throw new Error(`Invalid sort key: ${key}`);
  }
  if (before !== undefined && after !== undefined && before >= after) {
    throw new Error(`Sort key ${before} is not before ${after}`);
  }
  return midpoint(before ?? "", after);
}

function midpoint(a: string, b: string | undefined): string {
  if (b !== undefined) {
    let n = 0;
    while ((a[n] ?? "0") === b[n]) n++;
    if (n > 0) return b.slice(0, n) + midpoint(a.slice(n), b.slice(n));
  }

  const digitA = a === "" ? 0 : DIGITS.indexOf(a[0]!);
  const digitB = b === undefined ? DIGITS.length : DIGITS.indexOf(b[0]!);

  if (digitB - digitA > 1) {
    // Appending steps one digit instead of halving, so a menu typed in order
    // keeps one-character keys for its first 61 entries.
    const mid = b === undefined ? digitA + 1 : Math.round((digitA + digitB) / 2);
    return DIGITS[mid]!;
  }
  if (b !== undefined && b.length > 1) return b.slice(0, 1);
  return DIGITS[digitA]! + midpoint(a.slice(1), undefined);
}

/**
 * Sort keys that put `id` at `toIndex` among `siblings`. The record may be
 * new (absent from the list). Normally one change; if the neighbours' keys
 * are tied or corrupt, every sibling is re-keyed — rare, and still correct.
 */
export function placeAt(siblings: readonly Ordered[], id: string, toIndex: number): KeyChange[] {
  const others = sortByOrder(siblings.filter((s) => s.id !== id));
  const index = Math.max(0, Math.min(toIndex, others.length));
  const before = others[index - 1]?.sortKey;
  const after = others[index]?.sortKey;

  const fits =
    (before === undefined || isValidKey(before)) &&
    (after === undefined || isValidKey(after)) &&
    (before === undefined || after === undefined || before < after);
  if (fits) return [{ id, sortKey: keyBetween(before, after) }];

  const ids = others.map((o) => o.id);
  ids.splice(index, 0, id);
  let key: string | undefined;
  return ids.map((each) => ({ id: each, sortKey: (key = keyBetween(key)) }));
}
