// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Phone } from "../domain/phones";
import type { Email } from "../domain/signIn";
import { fakeAccountService, fakeClock, fakePhonesService, fakeSetupStore, fakeShopRepository } from "./fakes";
import type { Ports } from "./ports";
import { PortsProvider } from "./PortsProvider";
import { ShopProvider } from "./ShopProvider";
import { useJoin, type Join } from "./useJoin";
import { PHONES_POLL_MS, useAddPhone, usePhones, useRemovePhone, type Phones } from "./usePhones";
import { useRestaurantDetails } from "./useRestaurantDetails";

afterEach(() => vi.useRealTimers());

const phone = (id: string, over: Partial<Phone> = {}): Phone => ({ id, label: "Android phone", kind: "linked", lastSeenAt: 0, current: false, ...over });

async function setup({ owner = true, phones = [phone("me", { kind: "owner", current: true, label: "iPhone" })], empty = true } = {}) {
  const account = fakeAccountService({ knownEmails: ["owner@example.com"] });
  if (owner) await account.service.signIn("owner@example.com" as Email, "123456", undefined);
  const time = fakeClock(1_000_000);
  const list = fakePhonesService(phones, time.clock.now);
  const store = fakeSetupStore({ empty });
  const ports = { account: account.service, phones: list.service, setup: store.store, shop: fakeShopRepository({ name: "Sharma Dhaba", service: "both" }).repository, clock: time.clock } as Partial<Ports> as Ports;
  const wrapper = ({ children }: { children: ReactNode }) => (
    <PortsProvider ports={ports}>
      <ShopProvider>{children}</ShopProvider>
    </PortsProvider>
  );
  return { account, list, store, time, wrapper };
}

describe("usePhones", () => {
  it("lists the restaurant's phones, this one first, and removes another once however fast", async () => {
    const { list, wrapper } = await setup({ phones: [phone("w1"), phone("me", { kind: "owner", current: true })] });
    const { result } = renderHook(() => usePhones(), { wrapper });
    await waitFor(() => expect(result.current.state).toBe("ready"));
    const ready = result.current as Extract<Phones, { state: "ready" }>;
    expect(ready.phones.map((p) => p.id)).toEqual(["me", "w1"]);

    const removeSpy = vi.spyOn(list.service, "remove");
    const { result: remover } = renderHook(() => useRemovePhone(), { wrapper });
    await act(async () => {
      const done = await Promise.all([remover.current("w1"), remover.current("w1")]);
      expect(done.sort()).toEqual([false, true]);
    });
    expect(removeSpy).toHaveBeenCalledTimes(1);
    expect(list.state.phones.map((p) => p.id)).toEqual(["me"]);
  });

  it("is none of a linked phone's business", async () => {
    const { account, wrapper } = await setup({ owner: false });
    await account.service.join("482913");
    const { result } = renderHook(() => usePhones(), { wrapper });
    await waitFor(() => expect(result.current.state).toBe("hidden"));
  });

  it("says so when the list can't be had (offline)", async () => {
    const { list, wrapper } = await setup();
    list.state.offline = true;
    const { result } = renderHook(() => usePhones(), { wrapper });
    await waitFor(() => expect(result.current).toEqual({ state: "unavailable", problem: "offline" }));
  });
});

describe("useAddPhone", () => {
  it("shows a code, says when a new phone joins, and replaces a code that ran out", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { list, time, wrapper } = await setup();
    const { result } = renderHook(() => useAddPhone(), { wrapper });
    const who = () => result.current as Extract<ReturnType<typeof useAddPhone>, { state: "who" }>;
    act(() => who().showCode());
    expect(who().problem).toBe("noName");
    act(() => who().typeName("  Ravi "));
    act(() => who().showCode());
    expect(who().problem).toBe("noAnswer");
    act(() => who().answer(false));
    act(() => who().showCode());
    await waitFor(() => expect(result.current).toMatchObject({ state: "showing", person: "Ravi", code: "100001" }));
    expect(list.state.people).toEqual([{ name: "Ravi", roleId: "staff" }]);

    // Ten minutes pass with nobody joining: a fresh code.
    time.advance(10 * 60 * 1000);
    await act(() => vi.advanceTimersByTimeAsync(PHONES_POLL_MS));
    await waitFor(() => expect(result.current).toMatchObject({ state: "showing", code: "100002" }));

    list.state.phones.push(phone("waiter", { label: "Android phone" }));
    await act(() => vi.advanceTimersByTimeAsync(PHONES_POLL_MS));
    await waitFor(() => expect(result.current).toEqual({ state: "joined", person: "Ravi", label: "Android phone" }));
    // A fresh code is for the same person.
    expect(list.state.people).toEqual([{ name: "Ravi", roleId: "staff" }, { name: "Ravi", roleId: "staff" }]);
  });
});

describe("useJoin", () => {
  const render = async (opts: { empty?: boolean; offline?: boolean } = {}, link?: string) => {
    const env = await setup({ owner: false, empty: opts.empty ?? true });
    env.account.state.offline = opts.offline ?? false;
    return { ...env, ...renderHook(() => useJoin(link), { wrapper: env.wrapper }) };
  };
  const at = async <S extends Join["step"]>(result: { current: Join }, step: S) => {
    await waitFor(() => expect(result.current.step).toBe(step));
    return result.current as Extract<Join, { step: S }>;
  };

  it("checks the code, asks to join that restaurant, then joins once and skips the setup", async () => {
    const { result, account, store } = await render();
    await at(result, "code");
    act(() => (result.current as Extract<Join, { step: "code" }>).typeCode("482 91"));
    expect(result.current.step).toBe("code");
    act(() => (result.current as Extract<Join, { step: "code" }>).typeCode("482 913"));
    const confirm = await at(result, "confirm");
    expect(confirm.restaurantName).toBe("Sharma Dhaba");
    expect(account.calls.join).toEqual([]);

    await act(() => Promise.all([confirm.join(), confirm.join()]));
    expect(account.calls.join).toEqual(["482913"]);
    expect((await at(result, "joined")).restaurantName).toBe("Sharma Dhaba");
    expect(store.current().progress).toEqual({ step: "done" });
  });

  it("goes straight to the question from a scanned link", async () => {
    const { result } = await render({}, "#482913");
    expect((await at(result, "confirm")).restaurantName).toBe("Sharma Dhaba");
  });

  it("clears a wrong code, and says offline quietly", async () => {
    const { result, account } = await render();
    await at(result, "code");
    act(() => (result.current as Extract<Join, { step: "code" }>).typeCode("111111"));
    await waitFor(() => expect(result.current).toMatchObject({ step: "code", code: "", problem: "wrongCode" }));
    account.state.offline = true;
    act(() => (result.current as Extract<Join, { step: "code" }>).typeCode("482913"));
    await waitFor(() => expect(result.current).toMatchObject({ step: "code", code: "482913", problem: "offline" }));
  });

  it("never joins a phone that already keeps a restaurant", async () => {
    const { result, account } = await render({ empty: false }, "#482913");
    await at(result, "taken");
    expect(account.calls.join).toEqual([]);
  });
});

describe("a linked phone and the restaurant's details", () => {
  it("sees them but can't change them", async () => {
    const { account, wrapper } = await setup({ owner: false });
    await account.service.join("482913");
    const { result } = renderHook(() => useRestaurantDetails(), { wrapper });
    await waitFor(() => expect(result.current).toMatchObject({ state: "ready", canEdit: false }));
    const ready = result.current as Extract<typeof result.current, { state: "ready" }>;
    act(() => ready.toggle("dineIn"));
    expect((result.current as typeof ready).changed).toBe(false);
    expect(await ready.save()).toBe(false);
  });
});
