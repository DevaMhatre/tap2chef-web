// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { DishRow, SetupProgress, ShopDetails } from "../domain/setup";
import {
  fakeAccountService,
  fakeClock,
  fakeIds,
  fakeMenuRepository,
  fakeOrderRepository,
  fakeSetupStore,
  fakeShopRepository,
  fakeSwitch,
} from "./fakes";
import type { Ports } from "./ports";
import { PortsProvider } from "./PortsProvider";
import { useSafeCopyCard } from "./useRestaurant";
import { useSetup, type Setup } from "./useSetup";

type Options = { progress?: SetupProgress; empty?: boolean; details?: ShopDetails; knownEmails?: string[]; offline?: boolean };

function render({ progress, empty = true, details, knownEmails = [], offline = false, tables = 0 }: Options & { tables?: number } = {}) {
  const server = fakeAccountService({ knownEmails, offline });
  const setup = fakeSetupStore({ progress: progress ?? null, empty });
  const shop = fakeShopRepository(details ?? null);
  const menu = fakeMenuRepository();
  const orders = fakeOrderRepository({
    tables: Array.from({ length: tables }, (_, i) => ({ id: `t${i}` as never, name: `${i + 1}`, sortKey: `${i + 1}` })),
  });
  const network = fakeSwitch(!offline);
  const ports = {
    account: server.service,
    setup: setup.store,
    shop: shop.repository,
    menu: menu.repository,
    orders: orders.repository,
    network: network.network,
    ids: fakeIds(),
    clock: fakeClock(new Date(2026, 9, 30, 15, 0).getTime()).clock,
  } as Partial<Ports> as Ports;
  const wrapper = ({ children }: { children: ReactNode }) => <PortsProvider ports={ports}>{children}</PortsProvider>;
  const hook = renderHook(() => ({ setup: useSetup(), card: useSafeCopyCard() }), { wrapper });
  return { server, setup, shop, menu, orders, network, ...hook };
}

type Result = { current: { setup: Setup } };
async function at<S extends Setup["step"]>(result: Result, step: S): Promise<Extract<Setup, { step: S }>> {
  await waitFor(() => expect(result.current.setup.step).toBe(step));
  return result.current.setup as Extract<Setup, { step: S }>;
}

/** Email and code, each read from the latest render. */
async function signInWith(result: Result, email: string) {
  await at(result, "account");
  const signIn = () => (result.current.setup as Extract<Setup, { step: "account" }>).signIn;
  act(() => signIn().typeEmail(email));
  await act(() => signIn().sendCode());
  act(() => signIn().typeCode("123456"));
}

const priced = (name: string, price: string, category = "Biryani"): DishRow => ({
  kind: "starter",
  key: name,
  category,
  name,
  diet: "nonVeg",
  price,
});

describe("useSetup", () => {
  it("walks a new owner through: email, code, name, how customers order, tables, dishes, ready", async () => {
    const { result, server, shop, menu, orders, setup } = render();

    await signInWith(result, "new@example.com");

    await at(result, "name");
    act(() => (result.current.setup as Extract<Setup, { step: "name" }>).typeName(" Sharma  Dhaba "));
    await act(() => (result.current.setup as Extract<Setup, { step: "name" }>).next());
    // The account is made with the name, in the same step.
    expect(server.calls.signIn.at(-1)).toMatchObject({ email: "new@example.com", name: "Sharma Dhaba" });

    const service = await at(result, "service");
    expect(service.choice).toEqual({ dineIn: false, takeaway: false });
    act(() => service.toggle("dineIn"));
    act(() => (result.current.setup as Extract<Setup, { step: "service" }>).toggle("takeaway"));
    await act(() => (result.current.setup as Extract<Setup, { step: "service" }>).next());
    expect(shop.writes).toEqual([{ name: "Sharma Dhaba", service: "both" }]);

    const tables = await at(result, "tables");
    await act(() => tables.setUp(8));
    expect(orders.writes.flat().filter((c) => c.table === "tables")).toHaveLength(8);

    const dishes = await at(result, "menu");
    await act(async () => {
      expect(await dishes.addDishes([priced("Chicken Biryani", "180"), priced("Veg Biryani", ""), priced("Raita", "30", "Sides")])).toEqual({ ok: true, value: 2 });
    });
    const written = menu.writes.flat();
    expect(written.filter((c) => c.table === "profiles").map((c) => c.record.name)).toEqual(["Dine-In"]);
    expect(written.filter((c) => c.table === "categories").map((c) => c.record.name)).toEqual(["Biryani", "Sides"]);

    const ready = await at(result, "ready");
    expect(ready).toMatchObject({ name: "Sharma Dhaba", service: "both", tables: 8, dishes: 2 });
    await act(() => ready.start());
    await at(result, "done");
    expect(setup.current().progress).toEqual({ step: "done" });
  });

  it("sends a known owner straight to their restaurant", async () => {
    const { result } = render({ knownEmails: ["owner@example.com"] });
    await signInWith(result, "owner@example.com");
    await at(result, "done");
  });

  it("never sets up a phone that already has records", async () => {
    const { result, setup } = render({ empty: false });
    await at(result, "done");
    expect(setup.current().progress).toEqual({ step: "done" });
  });

  it("carries on offline, and the account takes the name already given later", async () => {
    const { result, shop } = render({ offline: true });
    const account = await at(result, "account");
    await act(() => account.later());
    const name = await at(result, "name");
    act(() => name.typeName("Chai Point"));
    await act(() => (result.current.setup as Extract<Setup, { step: "name" }>).next());

    const service = await at(result, "service");
    act(() => service.toggle("takeaway"));
    await act(() => (result.current.setup as Extract<Setup, { step: "service" }>).next());
    expect(shop.writes).toEqual([{ name: "Chai Point", service: "takeaway" }]);
    // Takeaway only: no tables asked.
    const dishes = await at(result, "menu");
    await act(() => dishes.addDishes([priced("Masala Chai", "15", "Drinks")]));
    const ready = await at(result, "ready");
    expect(ready.tables).toBe(0);
    await act(() => ready.start());
    await at(result, "done");
  });

  it("names a takeaway kitchen's price list Takeaway", async () => {
    const { result, menu } = render({ progress: { step: "menu" }, details: { name: "Chai Point", service: "takeaway" } });
    const dishes = await at(result, "menu");
    await act(() => dishes.addDishes([priced("Masala Chai", "15", "Drinks")]));
    expect(menu.writes.flat().find((c) => c.table === "profiles")?.record.name).toBe("Takeaway");
  });

  it("comes back to the same question, with the answer so far", async () => {
    const { result } = render({ progress: { step: "service", name: "Sharma Dhaba" } });
    const service = await at(result, "service");
    await act(() => service.back());
    const name = await at(result, "name");
    expect(name.name).toBe("Sharma Dhaba");
  });

  it("asks before moving on: a name, a way to order, prices that read", async () => {
    const { result, menu } = render({ progress: { step: "name" } });
    const name = await at(result, "name");
    await act(() => name.next());
    expect((result.current.setup as Extract<Setup, { step: "name" }>).problem).toBe("noName");

    act(() => (result.current.setup as Extract<Setup, { step: "name" }>).typeName("Sharma Dhaba"));
    await act(() => (result.current.setup as Extract<Setup, { step: "name" }>).next());
    const service = await at(result, "service");
    await act(() => service.next());
    expect((result.current.setup as Extract<Setup, { step: "service" }>).problem).toBe("none");
    expect(result.current.setup.step).toBe("service");

    act(() => (result.current.setup as Extract<Setup, { step: "service" }>).toggle("dineIn"));
    await act(() => (result.current.setup as Extract<Setup, { step: "service" }>).next());
    const tables = await at(result, "tables");
    await act(() => tables.setUp(4));
    const dishes = await at(result, "menu");
    await act(async () => {
      expect(await dishes.addDishes([priced("Chicken Biryani", "18o")])).toEqual({ ok: false, error: { "Chicken Biryani": { price: "invalid" } } });
    });
    expect(menu.writes).toEqual([]);
    expect(result.current.setup.step).toBe("menu");
  });

  it("adds the dishes once, however fast the button is tapped", async () => {
    const { result, menu } = render({ progress: { step: "menu" }, details: { name: "R", service: "both" } });
    const dishes = await at(result, "menu");
    await act(() => Promise.all([dishes.addDishes([priced("Chicken Biryani", "180")]), dishes.addDishes([priced("Chicken Biryani", "180")])]));
    expect(menu.writes.flat().filter((c) => c.table === "items")).toHaveLength(1);
  });

  it("answers how customers order once, however fast Next is tapped", async () => {
    const { result, shop } = render({ progress: { step: "service", name: "R" } });
    const service = await at(result, "service");
    act(() => service.toggle("takeaway"));
    const chosen = result.current.setup as Extract<Setup, { step: "service" }>;
    await act(() => Promise.all([chosen.next(), chosen.next()]));
    expect(shop.writes).toHaveLength(1);
  });

  it("doesn't ask for tables again after going back past them", async () => {
    const { result } = render({ progress: { step: "service", name: "R" }, details: { name: "R", service: "dineIn" }, tables: 6 });
    const service = await at(result, "service");
    await act(() => service.next());
    await at(result, "menu");
  });

  it("goes back from the menu to tables, or to how customers order when there are none", async () => {
    const dine = render({ progress: { step: "menu" }, details: { name: "R", service: "dineIn" } });
    const dineMenu = await at(dine.result, "menu");
    await act(() => dineMenu.back());
    await at(dine.result, "tables");

    const takeaway = render({ progress: { step: "menu" }, details: { name: "R", service: "takeaway" } });
    const takeawayMenu = await at(takeaway.result, "menu");
    await act(() => takeawayMenu.back());
    expect((await at(takeaway.result, "service")).choice).toEqual({ dineIn: false, takeaway: true });
  });
});

describe("the keep-a-copy card", () => {
  it("shows once, after setup, on a phone not signed in and online", async () => {
    const { result, network } = render({ progress: { step: "done" }, empty: false });
    await waitFor(() => expect(result.current.card.show).toBe(true));
    act(() => network.set(false));
    expect(result.current.card.show).toBe(false);
    act(() => network.set(true));
    act(() => result.current.card.dismiss());
    await waitFor(() => expect(result.current.card.show).toBe(false));
  });

  it("never shows during setup", async () => {
    const { result } = render({ progress: { step: "menu" }, details: { name: "R", service: "both" } });
    await at(result, "menu");
    expect(result.current.card.show).toBe(false);
  });
});
