// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ItemId, ProfileId } from "../domain/menu";
import { paise } from "../domain/money";
import type { BusinessDate, LineId, Order, OrderId, OrderLine, Payment, PaymentId, RoundId } from "../domain/order";
import type { TableId } from "../domain/tables";
import { fakeClock, fakeIds, fakeOrderRepository } from "./fakes";
import type { Ports } from "./ports";
import { PortsProvider } from "./PortsProvider";
import { useOrders } from "./useOrders";

const TODAY = "2026-10-29" as BusinessDate;
const t1 = "t1" as TableId;
const pay = (id: string, orderId: string, method: "cash" | "upi", amount: number): Payment => ({
  id: id as PaymentId,
  orderId: orderId as OrderId,
  amount: paise(amount),
  receivedAt: 5,
  method,
});

const paid = (id: string, settledAt: number, day = TODAY): Order => ({
  id: id as OrderId,
  channel: { type: "dineIn", tableId: t1 },
  profileId: "dine" as ProfileId,
  businessDate: day,
  openedAt: 1,
  state: { status: "settled", billedAt: settledAt, settledAt, subtotal: paise(22000) },
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

function renderOrders(extra: Payment[] = []) {
  const orders = fakeOrderRepository({
    tables: [{ id: t1, name: "1", sortKey: "1" }],
    orders: [paid("a", 10), paid("b", 20), paid("old", 30, "2026-10-28" as BusinessDate)],
    lines: [line("a"), line("b")],
    payments: [pay("pa", "a", "cash", 22000), pay("pb1", "b", "cash", 5000), pay("pb2", "b", "upi", 17000), pay("po", "old", "upi", 22000), ...extra],
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
    expect(orders.settled.map((s) => [s.order.id, s.bill.paid, s.lines.length])).toEqual([
      ["b", 22000, 1],
      ["a", 22000, 1],
    ]);
    expect(orders.takings).toEqual({ total: 44000, cash: 27000, upi: 17000 });
    expect(orders.today).toEqual([]);
  });

  it("corrects how a payment came in, and moves the drawers, not the total", async () => {
    const { result } = renderOrders();
    await waitFor(() => expect(result.current.state).toBe("ready"));
    await act(async () => {
      expect(await ready(result.current).correctPayment("pa" as PaymentId, "upi")).toEqual({ ok: true, value: undefined });
    });
    const orders = ready(result.current);
    expect(orders.takings).toEqual({ total: 44000, cash: 5000, upi: 39000 });
    expect(orders.settled.find((s) => s.order.id === "a")!.bill.payments[0]!.correctedAt).toBeDefined();
  });

  it("takes an excess off a settled bill, and the drawers stop counting it", async () => {
    // Bill "a" (₹220) was taken on two devices.
    const { result } = renderOrders([pay("pa2", "a", "cash", 22000)]);
    await waitFor(() => expect(result.current.state).toBe("ready"));
    const a = () => ready(result.current).settled.find((s) => s.order.id === "a")!;
    expect(a().bill.remaining).toBe(-22000);
    expect(ready(result.current).takings.cash).toBe(49000);
    expect(a().bill.payments.map((p) => ready(result.current).canRemove(a(), p))).toEqual([true, true]);

    await act(async () => {
      expect((await ready(result.current).removePayment("pa2" as PaymentId)).ok).toBe(true);
    });
    expect(a().bill.remaining).toBe(0);
    expect(ready(result.current).takings.cash).toBe(27000);
    expect(a().bill.payments.map((p) => ready(result.current).canRemove(a(), p))).toEqual([false, false]);
  });
});
