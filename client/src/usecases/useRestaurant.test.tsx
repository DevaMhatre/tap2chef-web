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
import { useRestaurantName, useShowsTables } from "./useRestaurant";

function render(details: ShopDetails | null, knownEmails: string[] = []) {
  const shop = fakeShopRepository(details);
  const account = fakeAccountService({ knownEmails });
  const ports = { shop: shop.repository, account: account.service } as Partial<Ports> as Ports;
  const wrapper = ({ children }: { children: ReactNode }) => (
    <PortsProvider ports={ports}>
      <ShopProvider>{children}</ShopProvider>
    </PortsProvider>
  );
  return { shop, account, ...renderHook(() => ({ tables: useShowsTables(), name: useRestaurantName() }), { wrapper }) };
}

describe("the restaurant's shape", () => {
  it("has no tables for a takeaway-only kitchen, and knows only once it has read", async () => {
    const { result, shop } = render({ name: "Chai Point", service: "takeaway" });
    expect(result.current.tables).toBeUndefined();
    await waitFor(() => expect(result.current.tables).toBe(false));
    expect(result.current.name).toBe("Chai Point");
    await act(() => shop.repository.write({ name: "Chai Point", service: "both" }));
    expect(result.current.tables).toBe(true);
  });

  it("keeps the tables of a restaurant set up before the question, and its account's name", async () => {
    const { result, account } = render(null, ["owner@example.com"]);
    await waitFor(() => expect(result.current.tables).toBe(true));
    expect(result.current.name).toBeUndefined();
    await act(() => account.service.signIn("owner@example.com" as Email, "123456", undefined).then(() => undefined));
    expect(result.current.name).toBe("Sharma Dhaba");
  });
});
