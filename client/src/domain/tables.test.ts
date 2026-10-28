import { describe, expect, it } from "vitest";
import { isTableCount, nextTableName, numberedTables, type DiningTable, type TableId } from "./tables";

const table = (name: string): DiningTable => ({ id: name as TableId, name, sortKey: "1" });

describe("tables", () => {
  it("numbers setup tables from 1", () => {
    expect(numberedTables(3)).toEqual(["1", "2", "3"]);
  });

  it("names the next table after the highest number, ignoring named ones", () => {
    expect(nextTableName([])).toBe("1");
    expect(nextTableName([table("1"), table("7"), table("Garden")])).toBe("8");
  });

  it("accepts whole counts from 1 to 60", () => {
    expect([0, 1, 60, 61, 2.5].map(isTableCount)).toEqual([false, true, true, false, false]);
  });
});
