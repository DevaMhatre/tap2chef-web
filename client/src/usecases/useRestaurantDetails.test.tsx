// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ShopDetails } from "../domain/setup";
import type { Email } from "../domain/signIn";
import { fakeAccountService, fakeShopRepository } from "./fakes";
import type { Ports } from "./ports";
import { PortsProvider } from "./PortsProvider";
import { ShopProvider } from "./ShopProvider";
import { useRestaurantDetails, type RestaurantDetails } from "./useRestaurantDetails";

async function render(details: ShopDetails | null, signedInAs?: string) {
  const shop = fakeShopRepository(details);
  const account = fakeAccountService({ knownEmails: signedInAs ? [signedInAs] : [] });
  if (signedInAs) await account.service.signIn(signedInAs as Email, "123456", undefined);
  const ports = { shop: shop.repository, account: account.service } as Partial<Ports> as Ports;
  const wrapper = ({ children }: { children: ReactNode }) => (
    <PortsProvider ports={ports}>
      <ShopProvider>{children}</ShopProvider>
    </PortsProvider>
  );
  const hook = renderHook(() => useRestaurantDetails(), { wrapper });
  await waitFor(() => expect(hook.result.current.state).toBe("ready"));
  return { shop, ...hook };
}

const ready = (r: { current: RestaurantDetails }) => r.current as Extract<RestaurantDetails, { state: "ready" }>;

describe("useRestaurantDetails", () => {
  it("starts from what is stored, with nothing to save until something changes", async () => {
    const { result, shop } = await render({ name: "Sharma Dhabba", service: "takeaway" });
    expect(ready(result)).toMatchObject({ name: "Sharma Dhabba", choice: { dineIn: false, takeaway: true }, changed: false });

    act(() => ready(result).typeName("Sharma Dhaba"));
    act(() => ready(result).toggle("dineIn"));
    expect(ready(result).changed).toBe(true);
    await act(async () => expect(await ready(result).save()).toBe(true));
    expect(shop.writes).toEqual([{ name: "Sharma Dhaba", service: "both" }]);
  });

  it("starts a restaurant from before the setup with its account's name and both ways", async () => {
    const { result, shop } = await render(null, "owner@example.com");
    expect(ready(result)).toMatchObject({ name: "Sharma Dhaba", choice: { dineIn: true, takeaway: true }, changed: true });
    await act(() => ready(result).save());
    expect(shop.writes).toEqual([{ name: "Sharma Dhaba", service: "both" }]);
  });

  it("refuses an empty name or no way to order, and writes nothing", async () => {
    const { result, shop } = await render({ name: "R", service: "dineIn" });
    act(() => ready(result).typeName("  "));
    await act(async () => expect(await ready(result).save()).toBe(false));
    expect(ready(result).problem).toBe("noName");
    act(() => ready(result).typeName("R"));
    act(() => ready(result).toggle("dineIn"));
    await act(() => ready(result).save());
    expect(ready(result).problem).toBe("noService");
    expect(shop.writes).toEqual([]);
  });

  it("saves once, however fast Save is tapped", async () => {
    const { result, shop } = await render({ name: "R", service: "dineIn" });
    act(() => ready(result).toggle("takeaway"));
    await act(() => Promise.all([ready(result).save(), ready(result).save()]));
    expect(shop.writes).toHaveLength(1);
  });
});
