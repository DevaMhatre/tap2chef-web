import { describe, expect, it } from "vitest";
import { compareOrder, isValidKey, keyBetween, placeAt, sortByOrder, type Ordered } from "./ordering";

describe("keyBetween", () => {
  it("starts a list and appends with short keys", () => {
    const keys: string[] = [];
    for (let i = 0; i < 61; i++) keys.push(keyBetween(keys.at(-1)));
    expect(keys[0]).toBe("1");
    expect(keys.every((k) => k.length === 1)).toBe(true);
    expect(keyBetween(keys.at(-1))).toBe("z1");
  });

  it("inserts before the first and between neighbours", () => {
    expect(keyBetween(undefined, "1")).toBe("01");
    expect(keyBetween("1", "2")).toBe("11");
    expect(keyBetween("1", "3")).toBe("2");
  });

  it("keeps order across many random insertions", () => {
    let seed = 7;
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const keys: string[] = [];
    for (let i = 0; i < 500; i++) {
      const at = Math.floor(random() * (keys.length + 1));
      const key = keyBetween(keys[at - 1], keys[at]);
      expect(isValidKey(key)).toBe(true);
      keys.splice(at, 0, key);
    }
    expect([...keys].sort()).toEqual(keys);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("rejects bad or out-of-order input", () => {
    expect(() => keyBetween("2", "1")).toThrow();
    expect(() => keyBetween("1", "1")).toThrow();
    expect(() => keyBetween("10")).toThrow();
    expect(() => keyBetween("a-b")).toThrow();
  });
});

describe("compareOrder", () => {
  it("breaks tied keys by id so every device agrees", () => {
    const records = [
      { id: "b", sortKey: "5" },
      { id: "a", sortKey: "5" },
      { id: "c", sortKey: "4" },
    ];
    expect(sortByOrder(records).map((r) => r.id)).toEqual(["c", "a", "b"]);
    expect(compareOrder(records[0]!, records[0]!)).toBe(0);
  });
});

describe("placeAt", () => {
  const list: Ordered[] = [
    { id: "a", sortKey: "1" },
    { id: "b", sortKey: "2" },
    { id: "c", sortKey: "3" },
  ];
  const apply = (records: Ordered[], changes: Ordered[]) =>
    sortByOrder([
      ...records.filter((r) => !changes.some((c) => c.id === r.id)),
      ...changes,
    ]).map((r) => r.id);

  it("moves one record with one write", () => {
    const changes = placeAt(list, "c", 0);
    expect(changes).toHaveLength(1);
    expect(apply(list, changes)).toEqual(["c", "a", "b"]);
  });

  it("places a new record at the end, or clamps an out-of-range index", () => {
    expect(apply(list, placeAt(list, "new", 3))).toEqual(["a", "b", "c", "new"]);
    expect(apply(list, placeAt(list, "new", 99))).toEqual(["a", "b", "c", "new"]);
    expect(apply(list, placeAt(list, "new", -5))).toEqual(["new", "a", "b", "c"]);
  });

  it("places the first record of an empty list", () => {
    expect(placeAt([], "x", 0)).toEqual([{ id: "x", sortKey: "1" }]);
  });

  it("re-keys the list when the neighbours are tied", () => {
    const tied = [
      { id: "a", sortKey: "5" },
      { id: "b", sortKey: "5" },
    ];
    const changes = placeAt(tied, "x", 1);
    expect(changes).toHaveLength(3);
    expect(apply(tied, changes)).toEqual(["a", "x", "b"]);
  });

  it("re-keys the list when a neighbour key is corrupt", () => {
    const corrupt = [
      { id: "a", sortKey: "1" },
      { id: "b", sortKey: "" },
    ];
    const changes = placeAt(corrupt, "x", 1);
    expect(changes.every((c) => isValidKey(c.sortKey))).toBe(true);
  });
});
