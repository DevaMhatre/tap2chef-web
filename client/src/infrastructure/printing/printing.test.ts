import { describe, expect, it } from "vitest";
import type { Kot } from "../../domain/kot";
import { kotBytes, kotPage } from "./kitchenPrinter";
import { receipt, testKot } from "./escpos";
import { BLE_CHUNK, writeChunks } from "./printerCheck";

describe("ESC/POS", () => {
  it("resets, prints a big centred title and plain lines, then feeds the paper out", () => {
    const bytes = [...receipt({ title: "KOT", lines: ["2 x Dal"] })];
    expect(bytes.slice(0, 2)).toEqual([0x1b, 0x40]);
    expect(bytes.slice(2, 8)).toEqual([0x1b, 0x61, 1, 0x1d, 0x21, 0x11]);
    expect(String.fromCharCode(...bytes.slice(8, 11))).toBe("KOT");
    expect(String.fromCharCode(...bytes.slice(-12, -6))).toBe("x Dal\n");
    expect(bytes.slice(-6)).toEqual([0x1b, 0x64, 4, 0x1d, 0x56, 0x01]);
  });

  it("sends only what the printer's font surely has", () => {
    expect([...receipt({ lines: ["₹180"] })].slice(2, 6)).toEqual([0x3f, 0x31, 0x38, 0x30]);
  });

  it("prints a test KOT", () => {
    expect(new TextDecoder().decode(testKot())).toContain("Chicken Biryani");
  });
});

describe("writing to a Bluetooth printer", () => {
  it("sends small chunks in order, each waited for", async () => {
    const sent: number[][] = [];
    const characteristic = {
      properties: { write: true, writeWithoutResponse: false },
      writeValueWithResponse: async (data: BufferSource) => void sent.push([...new Uint8Array(data as ArrayBuffer)]),
      writeValueWithoutResponse: async () => {
        throw new Error("not this one");
      },
    };
    const bytes = Uint8Array.from({ length: 45 }, (_, i) => i);
    await writeChunks(characteristic, bytes);
    expect(sent.map((c) => c.length)).toEqual([BLE_CHUNK, BLE_CHUNK, 5]);
    expect(sent.flat()).toEqual([...bytes]);
  });
});

describe("the KOT, for a printer", () => {
  const kot: Kot = { title: "Table 4", kind: "round", round: 1, at: new Date(2026, 10, 1, 13, 42).getTime(), lines: [{ quantity: 2, name: "Biryani <Special>", portion: "Half" }] };

  it("is a page the size of a 58 mm roll, with names escaped and HALF in capitals", () => {
    const page = kotPage(kot);
    expect(page).toContain("size: 58mm auto");
    expect(page).toContain("<h1>Table 4</h1>");
    expect(page).toContain("2 x Biryani &lt;Special&gt; HALF");
    expect(page).not.toContain("<Special>");
  });

  it("is ESC/POS bytes: reset, the title, the lines, then the paper fed out", () => {
    const bytes = kotBytes(kot);
    expect([...bytes.slice(0, 2)]).toEqual([0x1b, 0x40]);
    const text = String.fromCharCode(...bytes);
    expect(text).toContain("Table 4");
    expect(text).toContain("2 x Biryani <Special> HALF");
    expect([...bytes.slice(-3)]).toEqual([0x1d, 0x56, 0x01]);
  });
});
