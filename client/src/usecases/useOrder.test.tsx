// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Category, CategoryId, ItemId, MenuItem, MenuProfile, ProfileId } from "../domain/menu";
import { paise } from "../domain/money";
import type { OrderId } from "../domain/order";
import type { BillInput } from "../domain/settlement";
import type { TableId } from "../domain/tables";
import { fakeClock, fakeIds, fakeMenuRepository, fakeOrderRepository } from "./fakes";
import type { MenuSnapshot, Ports } from "./ports";
import { PortsProvider } from "./PortsProvider";
import { useOrder, type OrderTarget } from "./useOrder";

const dineIn: MenuProfile = { id: "dine" as ProfileId, name: "Dine-In", sortKey: "1" };
const takeaway: MenuProfile = { id: "take" as ProfileId, name: "Takeaway", sortKey: "2" };
const mains: Category = { id: "mains" as CategoryId, name: "Mains", sortKey: "1" };
const item = (id: string, prices: MenuItem["prices"], sortKey = "1"): MenuItem => ({
  id: id as ItemId,
  name: id,
  categoryId: mains.id,
  diet: "veg",
  sortKey,
  prices,
});
const fixed = (rupees: number) => ({ kind: "fixed" as const, price: paise(rupees * 100) });
const menu: Partial<MenuSnapshot> = {
  profiles: [dineIn, takeaway],
  categories: [mains],
  items: [
    item("Dal Makhani", { [dineIn.id]: fixed(220), [takeaway.id]: fixed(200) }, "1"),
    item("Paneer Tikka", { [dineIn.id]: fixed(240) }, "2"),
  ],
};
const t1 = "t1" as TableId;

function renderOrder(target: OrderTarget, menuInitial: Partial<MenuSnapshot> = menu) {
  const orders = fakeOrderRepository({ tables: [{ id: t1, name: "1", sortKey: "1" }] });
  const ports = {
    menu: fakeMenuRepository(menuInitial).repository,
    orders: orders.repository,
    ids: fakeIds(),
    clock: fakeClock(new Date(2026, 9, 29, 13, 0).getTime()).clock,
  } as Partial<Ports> as Ports;
  const wrapper = ({ children }: { children: ReactNode }) => <PortsProvider ports={ports}>{children}</PortsProvider>;
  return { orders, ...renderHook(() => useOrder(target), { wrapper }) };
}

const ready = <T extends { state: string }>(screen: T) => {
  if (screen.state !== "ready") throw new Error(`Not ready: ${screen.state}`);
  return screen as Extract<T, { state: "ready" }>;
};

describe("useOrder", () => {
  it("prices a table from Dine-In and a takeaway from Takeaway", async () => {
    const table = renderOrder({ kind: "table", tableId: t1 });
    await waitFor(() => expect(table.result.current.state).toBe("ready"));
    const dine = ready(table.result.current);
    expect(dine.label).toEqual({ kind: "table", name: "1" });
    expect(dine.dishes.map((d) => [d.item.name, d.pricing.price])).toEqual([
      ["Dal Makhani", 22000],
      ["Paneer Tikka", 24000],
    ]);

    const parcel = renderOrder({ kind: "takeaway", orderId: "new" as OrderId });
    await waitFor(() => expect(parcel.result.current.state).toBe("ready"));
    const take = ready(parcel.result.current);
    expect(take.label).toEqual({ kind: "token", token: 1 });
    // Paneer Tikka is dine-in only.
    expect(take.dishes.map((d) => [d.item.name, d.pricing.price])).toEqual([["Dal Makhani", 20000]]);
  });

  it("adds, shows the cart and sends a round", async () => {
    const { result } = renderOrder({ kind: "table", tableId: t1 });
    await waitFor(() => expect(result.current.state).toBe("ready"));
    await act(async () => {
      const screen = ready(result.current);
      await screen.addDish(screen.dishes[0]!);
      await screen.addDish(screen.dishes[0]!);
    });
    expect(ready(result.current).dishes[0]!.inCart).toBe(2);
    expect(ready(result.current).ticket.total).toBe(44000);
    expect(ready(result.current).profileChoice).toBeNull(); // fixed once a dish is in

    await act(async () => {
      expect(await ready(result.current).send()).toBe(1);
    });
    expect(ready(result.current).ticket).toMatchObject({ draft: [], rounds: [{ number: 1 }] });
    expect(ready(result.current).dishes[0]!.inCart).toBe(0);
  });

  it("lets a new order switch price list before its first dish", async () => {
    const { result } = renderOrder({ kind: "table", tableId: t1 });
    await waitFor(() => expect(result.current.state).toBe("ready"));
    expect(ready(result.current).profileChoice?.chosen).toBe(dineIn.id);
    act(() => ready(result.current).chooseProfile(takeaway.id));
    expect(ready(result.current).profileName).toBe("Takeaway");
    expect(ready(result.current).dishes).toHaveLength(1);
  });

  it("says when there is no menu or no such table", async () => {
    const empty = renderOrder({ kind: "table", tableId: t1 }, {});
    await waitFor(() => expect(empty.result.current.state).toBe("noMenu"));
    const gone = renderOrder({ kind: "table", tableId: "gone" as TableId });
    await waitFor(() => expect(gone.result.current.state).toBe("missing"));
  });

  const input = (patch: Partial<BillInput> = {}): BillInput => ({ finalAmount: "", reason: "", method: null, received: "", ...patch });

  it("leads from Send to Bill to Settle, takes money in parts, and frees the table", async () => {
    const { result } = renderOrder({ kind: "table", tableId: t1 });
    await waitFor(() => expect(result.current.state).toBe("ready"));
    expect(ready(result.current).next).toBeNull();
    await act(async () => {
      await ready(result.current).addDish(ready(result.current).dishes[0]!); // Dal ₹220
    });
    expect(ready(result.current).next).toBe("send");
    await act(async () => {
      await ready(result.current).send();
    });
    expect(ready(result.current).next).toBe("bill");
    await act(async () => {
      await ready(result.current).presentBill();
    });
    expect(ready(result.current).next).toBe("settle");

    // Nothing is recorded until a method is chosen and the amount makes sense.
    expect(await ready(result.current).receive(input({ received: "220" }))).toEqual({ ok: false, error: "invalid" });
    expect(await ready(result.current).receive(input({ method: "upi", received: "300" }))).toEqual({ ok: false, error: "invalid" });

    await act(async () => {
      expect(await ready(result.current).receive(input({ method: "upi", received: "100" }))).toMatchObject({ ok: true, value: { settled: false } });
    });
    expect(ready(result.current).bill).toMatchObject({ paid: 10000, remaining: 12000 });
    expect(ready(result.current).billInput).toEqual(input());

    // A discount agreed with a part payment stays agreed when the sheet opens again.
    await act(async () => {
      await ready(result.current).receive(input({ method: "upi", received: "20", finalAmount: "200", reason: "Regular" }));
    });
    expect(ready(result.current).billInput).toEqual(input({ finalAmount: "200", reason: "Regular" }));
    expect(ready(result.current).bill).toMatchObject({ due: 20000, paid: 12000, remaining: 8000 });

    await act(async () => {
      const last = await ready(result.current).receive({ ...ready(result.current).billInput, method: "cash", received: "500" });
      expect(last).toMatchObject({ ok: true, value: { settled: true, change: 42000 } });
    });
    // The table is free: a fresh, empty order.
    expect(ready(result.current).ticket.rounds).toEqual([]);
    expect(ready(result.current).next).toBeNull();
  });

  it("shows a paid takeaway as paid", async () => {
    const { result } = renderOrder({ kind: "takeaway", orderId: "tk" as OrderId });
    await waitFor(() => expect(result.current.state).toBe("ready"));
    await act(async () => {
      await ready(result.current).addDish(ready(result.current).dishes[0]!);
      await ready(result.current).send();
    });
    await act(async () => {
      await ready(result.current).presentBill();
    });
    await act(async () => {
      await ready(result.current).receive(input({ method: "upi", received: "200" }));
    });
    expect(result.current).toEqual({ state: "settled", label: { kind: "token", token: 1 }, paid: 20000 });
  });
});
