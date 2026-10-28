// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Category, CategoryId, ItemId, MenuItem, MenuProfile, ProfileId } from "../domain/menu";
import { paise } from "../domain/money";
import type { OrderId } from "../domain/order";
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
});
