// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSwitch, fakeSyncService } from "./fakes";
import type { Ports } from "./ports";
import { PortsProvider } from "./PortsProvider";
import { PULL_EVERY_MS, PUSH_AFTER_MS, useSync } from "./useSync";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function setup(signedIn = true) {
  const sync = fakeSyncService();
  const network = fakeSwitch();
  const screen = fakeSwitch();
  const ports = { sync: sync.service, network: network.network, visibility: screen.visibility } as Partial<Ports> as Ports;
  const wrapper = ({ children }: { children: ReactNode }) => <PortsProvider ports={ports}>{children}</PortsProvider>;
  const hook = renderHook(({ on }) => useSync(on), { wrapper, initialProps: { on: signedIn } });
  return { sync, network, screen, ...hook };
}

const tick = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

describe("useSync", () => {
  it("does nothing until the device is signed in, and says the work is on the device", async () => {
    const { sync, result } = setup(false);
    await tick(PULL_EVERY_MS * 3);
    expect(sync.state.runs).toBe(0);
    expect(result.current).toBe("device");
  });

  it("syncs at once, then every few seconds, and says the work is online", async () => {
    const { sync, result } = setup();
    await tick(0);
    expect(sync.state.runs).toBe(1);
    expect(result.current).toBe("online");
    await tick(PULL_EVERY_MS * 2);
    expect(sync.state.runs).toBe(3);
  });

  it("sends a change made here within a moment, not at the next pull", async () => {
    const { sync, result } = setup();
    await tick(0);
    act(() => sync.setWaiting(1));
    expect(result.current).toBe("device");
    await tick(PUSH_AFTER_MS);
    expect(sync.state.runs).toBe(2);
    expect(result.current).toBe("online");
  });

  it("waits while offline or off screen, and catches up when back", async () => {
    const { sync, network, screen, result } = setup();
    await tick(0);
    act(() => network.set(false));
    act(() => sync.setWaiting(2));
    await tick(PULL_EVERY_MS * 3);
    expect(sync.state.runs).toBe(1);
    expect(result.current).toBe("device");

    act(() => network.set(true));
    await tick(0);
    expect(sync.state.runs).toBe(2);
    expect(result.current).toBe("online");

    act(() => screen.set(false));
    await tick(PULL_EVERY_MS * 3);
    expect(sync.state.runs).toBe(2);
  });

  it("says the work is only on the device when a sync fails, until one succeeds", async () => {
    const { sync, result } = setup();
    await tick(0);
    expect(result.current).toBe("online");
    sync.state.next = "failed";
    await tick(PULL_EVERY_MS);
    expect(result.current).toBe("device");
    sync.state.next = undefined;
    await tick(PULL_EVERY_MS);
    expect(result.current).toBe("online");
  });

  it("never runs two syncs at once, and runs once more for a change made during one", async () => {
    const { sync } = setup();
    sync.state.slow = PULL_EVERY_MS * 2;
    await tick(10);
    act(() => sync.setWaiting(1));
    await tick(PULL_EVERY_MS * 2);
    expect(sync.state.maxInFlight).toBe(1);
    sync.state.slow = 0;
    await tick(PULL_EVERY_MS * 2);
    expect(sync.state.maxInFlight).toBe(1);
    expect(sync.state.runs).toBeGreaterThanOrEqual(2);
  });

  it("stops when signed out", async () => {
    const { sync, rerender } = setup();
    await tick(0);
    rerender({ on: false });
    await tick(PULL_EVERY_MS * 3);
    expect(sync.state.runs).toBe(1);
  });
});
