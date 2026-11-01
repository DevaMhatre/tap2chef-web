// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ItemId, ProfileId } from "../domain/menu";
import { paise } from "../domain/money";
import type { BusinessDate, LineId, Order, OrderId, OrderLine, RoundId } from "../domain/order";
import type { TableId } from "../domain/tables";
import { fakeClock, fakeIds, fakeOrderRepository, fakePrinterLink, fakeSwitch } from "./fakes";
import type { Ports } from "./ports";
import { PortsProvider } from "./PortsProvider";
import { RETRY_AFTER_MS, useKitchenPrinting } from "./useKitchenPrinting";

const NOW = new Date(2026, 10, 1, 20, 0).getTime();
const DAY = "2026-11-01" as BusinessDate;
const t3 = "t3" as TableId;
const order: Order = { id: "o1" as OrderId, channel: { type: "dineIn", tableId: t3 }, profileId: "p" as ProfileId, businessDate: DAY, openedAt: 1, state: { status: "open" } };
const line = (id: string, roundId: string, sentAt: number, over: Partial<OrderLine> = {}): OrderLine => ({
  id: id as LineId,
  orderId: order.id,
  itemId: id as ItemId,
  name: id,
  diet: "veg",
  unitPrice: paise(10000),
  quantity: 1,
  note: "",
  addedAt: sentAt,
  state: { status: "sent", roundId: roundId as RoundId, sentAt },
  ...over,
});

function setup(lines: OrderLine[] = []) {
  const orders = fakeOrderRepository({ tables: [{ id: t3, name: "3", sortKey: "1" }], orders: [order], lines });
  const printer = fakePrinterLink();
  const net = fakeSwitch(true);
  const ports = { orders: orders.repository, ids: fakeIds(), clock: fakeClock(NOW).clock, printerLink: printer.link, network: net.network } as Partial<Ports> as Ports;
  const wrapper = ({ children }: { children: ReactNode }) => <PortsProvider ports={ports}>{children}</PortsProvider>;
  return { orders, printer, net, ...renderHook(() => useKitchenPrinting(), { wrapper }) };
}

const sendRound = (orders: ReturnType<typeof fakeOrderRepository>, line: OrderLine) =>
  act(async () => {
    await orders.repository.write([{ op: "put", table: "lines", record: line }]);
  });

describe("useKitchenPrinting", () => {
  it("won't start printing before it knows what was already sent", async () => {
    const { result } = setup([line("Dal", "r1", 10)]);
    expect(result.current.loaded).toBe(false);
    expect(await result.current.connect()).toEqual({ ok: false, error: "failed" });
  });

  it("prints nothing that was sent before this phone started printing", async () => {
    const { result, printer } = setup([line("Dal", "r1", 10)]);
    await waitFor(() => expect(result.current.loaded).toBe(true));
    await act(async () => {
      await result.current.connect();
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(printer.printed).toEqual([]);
    expect(result.current.waiting).toBe(0);
  });

  it("prints each round a waiter sends, once, numbered from 1, and notes it for every phone", async () => {
    const { result, printer, orders } = setup();
    await waitFor(() => expect(result.current.loaded).toBe(true));
    await act(async () => {
      await result.current.connect();
    });
    await sendRound(orders, line("Dal", "r1", NOW));
    await sendRound(orders, line("Naan", "r2", NOW + 1));
    await waitFor(() => expect(printer.printed).toHaveLength(2));
    expect(printer.printed.map((k) => [k.number, k.title, k.lines[0]!.name])).toEqual([
      [1, "Table 3", "Dal"],
      [2, "Table 3", "Naan"],
    ]);
    await waitFor(() => expect(orders.current().kotPrints.map((p) => [p.id, p.number])).toEqual([["round:r1", 1], ["round:r2", 2]]));
    await new Promise((r) => setTimeout(r, 20));
    expect(printer.printed).toHaveLength(2);
  });

  it("never prints a slip twice or reuses a number while the record of the last one is on its way", async () => {
    const { result, printer, orders } = setup();
    await waitFor(() => expect(result.current.loaded).toBe(true));
    await act(async () => {
      await result.current.connect();
      act(() => printer.set({ kind: "lost", name: "EZO" }));
    });
    await sendRound(orders, line("Dal", "r1", NOW));
    await sendRound(orders, line("Naan", "r2", NOW + 1));
    orders.lag.ms = 150;
    act(() => printer.set({ kind: "ready", name: "EZO" }));
    await waitFor(() => expect(printer.printed.length).toBeGreaterThanOrEqual(2));
    await new Promise((r) => setTimeout(r, 400));
    expect(printer.printed.map((k) => [k.number, k.lines[0]!.name])).toEqual([
      [1, "Dal"],
      [2, "Naan"],
    ]);
  });

  it("prints a CANCEL for a dish cancelled after the kitchen had it", async () => {
    const { result, printer, orders } = setup();
    await waitFor(() => expect(result.current.loaded).toBe(true));
    await act(async () => {
      await result.current.connect();
    });
    await sendRound(orders, line("Dal", "r1", NOW));
    await waitFor(() => expect(printer.printed).toHaveLength(1));
    await sendRound(orders, line("Dal", "r1", NOW, { state: { status: "voided", roundId: "r1" as RoundId, sentAt: NOW, voidedAt: NOW + 5, by: "Ravi" } }));
    await waitFor(() => expect(printer.printed).toHaveLength(2));
    expect(printer.printed[1]).toMatchObject({ kind: "cancel", number: 2, by: "Ravi" });
  });

  it("waits while the printer is out of reach, counts what waits, then catches up", async () => {
    const { result, printer, orders } = setup();
    await waitFor(() => expect(result.current.loaded).toBe(true));
    await act(async () => {
      await result.current.connect();
    });
    act(() => printer.set({ kind: "lost", name: "EZO" }));
    await sendRound(orders, line("Dal", "r1", NOW));
    await waitFor(() => expect(result.current.waiting).toBe(1));
    expect(printer.printed).toEqual([]);
    act(() => printer.set({ kind: "ready", name: "EZO" }));
    await waitFor(() => expect(printer.printed).toHaveLength(1));
    await waitFor(() => expect(result.current.waiting).toBe(0));
  });

  it("keeps the KOTs that waited when the printer is picked again", async () => {
    const { result, printer, orders } = setup();
    await waitFor(() => expect(result.current.loaded).toBe(true));
    await act(async () => {
      await result.current.connect();
    });
    act(() => printer.set({ kind: "lost", name: "EZO" }));
    await sendRound(orders, line("Dal", "r1", NOW));
    await waitFor(() => expect(result.current.waiting).toBe(1));
    await act(async () => {
      await result.current.connect();
    });
    await waitFor(() => expect(printer.printed.map((k) => k.lines[0]!.name)).toEqual(["Dal"]));
  });

  it("never prints what was sent while this phone had stopped printing", async () => {
    const { result, printer, orders } = setup();
    await waitFor(() => expect(result.current.loaded).toBe(true));
    await act(async () => {
      await result.current.connect();
    });
    await act(async () => {
      await result.current.stop();
    });
    await sendRound(orders, line("Dal", "r1", NOW));
    await act(async () => {
      await result.current.connect();
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(printer.printed).toEqual([]);
  });

  it("says when the printing phone is offline: waiters' rounds can't reach it", async () => {
    const { result, net } = setup();
    await waitFor(() => expect(result.current.loaded).toBe(true));
    await act(async () => {
      await result.current.connect();
    });
    expect(result.current.offline).toBe(false);
    act(() => net.set(false));
    expect(result.current.offline).toBe(true);
  });

  it("notes the dishes already cancelled with the round, and never prints a slip again if its record can't be saved", async () => {
    const { result, printer, orders } = setup();
    await waitFor(() => expect(result.current.loaded).toBe(true));
    await act(async () => {
      await result.current.connect();
    });
    act(() => printer.set({ kind: "lost", name: "EZO" }));
    await sendRound(orders, line("Dal", "r1", NOW));
    await sendRound(orders, line("Naan", "r1", NOW, { state: { status: "voided", roundId: "r1" as RoundId, sentAt: NOW, voidedAt: NOW + 1 } }));
    act(() => printer.set({ kind: "ready", name: "EZO" }));
    await waitFor(() => expect(orders.current().kotPrints).toHaveLength(1));
    expect(orders.current().kotPrints[0]).toMatchObject({ cancelledBefore: ["Naan"] });
    expect(printer.printed.map((k) => k.kind)).toEqual(["round"]);

    // The next slip prints, and saving its record fails.
    act(() => printer.set({ kind: "lost", name: "EZO" }));
    await sendRound(orders, line("Tea", "r2", NOW + 2));
    const failing = vi.spyOn(orders.repository, "write").mockRejectedValueOnce(new Error("disk full"));
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    act(() => printer.set({ kind: "ready", name: "EZO" }));
    await waitFor(() => expect(printer.printed).toHaveLength(2));
    failing.mockRestore();
    // The next round comes in: Tea must not come out again before it.
    await sendRound(orders, line("Chai", "r3", NOW + 3));
    await waitFor(() => expect(printer.printed).toHaveLength(3));
    await new Promise((r) => setTimeout(r, 100));
    expect(printer.printed.map((k) => k.lines[0]!.name)).toEqual(["Dal", "Tea", "Chai"]);
    errors.mockRestore();
  });

  it("tries a slip that didn't go out again a few seconds later", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const { result, printer, orders } = setup();
      await waitFor(() => expect(result.current.loaded).toBe(true));
      await act(async () => {
        await result.current.connect();
      });
      printer.control.failNext = 1;
      await sendRound(orders, line("Dal", "r1", NOW));
      await waitFor(() => expect(printer.control.failNext).toBe(0));
      expect(printer.printed).toEqual([]);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(RETRY_AFTER_MS);
      });
      await waitFor(() => expect(printer.printed).toHaveLength(1));
    } finally {
      vi.useRealTimers();
    }
  });
});
