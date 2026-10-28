// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ItemId, ProfileId } from "../domain/menu";
import { paise } from "../domain/money";
import type { BusinessDate, LineId, Order, OrderId, OrderLine, RoundId } from "../domain/order";
import type { TableId } from "../domain/tables";
import { fakeClock, fakeIds, fakeOrderRepository } from "./fakes";
import type { Ports } from "./ports";
import { PortsProvider } from "./PortsProvider";
import { useOrders } from "./useOrders";

const TODAY = "2026-10-29" as BusinessDate;
const t1 = "t1" as TableId;
const cash = (amount: number) => ({ method: "cash" as const, amount: paise(amount) });
const upi = (amount: number) => ({ method: "upi" as const, amount: paise(amount) });

const paid = (id: string, settledAt: number, payments: ReturnType<typeof cash | typeof upi>[], day = TODAY): Order => ({
  id: id as OrderId,
  channel: { type: "dineIn", tableId: t1 },
  profileId: "dine" as ProfileId,
  businessDate: day,
  openedAt: 1,
  state: { status: "settled", settledAt, bill: { subtotal: paise(payments.reduce((n, p) => n + p.amount, 0)), payments } },
});
const line = (orderId: string): OrderLine => ({
  id: `${orderId}-l` as LineId,
  orderId: orderId as OrderId,
  itemId: "dal" as ItemId,
  name: "Dal",
  diet: "veg",
  unitPrice: paise(22000),
  quantity: 1,
  note: "",
  addedAt: 1,
  state: { status: "sent", roundId: "r" as RoundId, sentAt: 2 },
});

function renderOrders() {
  const orders = fakeOrderRepository({
    tables: [{ id: t1, name: "1", sortKey: "1" }],
    orders: [paid("a", 10, [cash(22000)]), paid("b", 20, [cash(5000), upi(17000)]), paid("old", 30, [upi(9900)], "2026-10-28" as BusinessDate)],
    lines: [line("a"), line("b")],
  });
  const ports = {
    orders: orders.repository,
    ids: fakeIds(),
    clock: fakeClock(new Date(2026, 9, 29, 22, 0).getTime()).clock,
  } as Partial<Ports> as Ports;
  const wrapper = ({ children }: { children: ReactNode }) => <PortsProvider ports={ports}>{children}</PortsProvider>;
  return { orders, ...renderHook(() => useOrders(), { wrapper }) };
}

const ready = <T extends { state: string }>(screen: T) => {
  if (screen.state !== "ready") throw new Error(`Not ready: ${screen.state}`);
  return screen as Extract<T, { state: "ready" }>;
};

describe("useOrders", () => {
  it("lists today's paid bills, latest first, with the takings by drawer", async () => {
    const { result } = renderOrders();
    await waitFor(() => expect(result.current.state).toBe("ready"));
    const orders = ready(result.current);
    expect(orders.settled.map((s) => [s.order.id, s.paid, s.lines.length])).toEqual([
      ["b", 22000, 1],
      ["a", 22000, 1],
    ]);
    expect(orders.takings).toEqual({ total: 44000, cash: 27000, upi: 17000 });
    expect(orders.today).toEqual([]);
  });

  it("corrects how a bill was paid, and moves the drawers, not the total", async () => {
    const { result } = renderOrders();
    await waitFor(() => expect(result.current.state).toBe("ready"));
    expect(await ready(result.current).correct("a" as OrderId, "split", "")).toEqual({ ok: false, error: "invalid" });
    expect(ready(result.current).quoteSplit(paise(22000), "20")).toEqual({ ok: true, value: [cash(2000), upi(20000)] });

    await act(async () => {
      expect(await ready(result.current).correct("a" as OrderId, "upi", "")).toEqual({ ok: true, value: undefined });
    });
    const orders = ready(result.current);
    expect(orders.takings).toEqual({ total: 44000, cash: 5000, upi: 39000 });
    expect(orders.settled.find((s) => s.order.id === "a")!.order.state.correctedAt).toBeDefined();
  });
});
