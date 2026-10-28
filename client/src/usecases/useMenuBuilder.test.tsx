// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { fakeIds, fakeMenuRepository } from "./fakes";
import type { Ports } from "./ports";
import { PortsProvider } from "./PortsProvider";
import { useMenuBuilder } from "./useMenuBuilder";

function renderMenuBuilder() {
  const fake = fakeMenuRepository();
  const ports = {
    menu: fake.repository,
    ids: fakeIds(),
  } as Partial<Ports> as Ports;
  const wrapper = ({ children }: { children: ReactNode }) => <PortsProvider ports={ports}>{children}</PortsProvider>;
  return { fake, ...renderHook(() => useMenuBuilder(), { wrapper }) };
}

describe("useMenuBuilder", () => {
  it("goes from loading to empty to ready", async () => {
    const { result } = renderMenuBuilder();
    expect(result.current.state).toBe("loading");

    await waitFor(() => expect(result.current.state).toBe("empty"));
    await act(async () => {
      if (result.current.state === "empty") await result.current.createMenu();
    });
    expect(result.current).toMatchObject({ state: "ready", profiles: [{ name: "Dine-In" }], sections: [] });
  });

  it("shows what was just added", async () => {
    const { result } = renderMenuBuilder();
    await waitFor(() => expect(result.current.state).toBe("empty"));
    await act(async () => {
      if (result.current.state === "empty") await result.current.createMenu();
    });
    await act(async () => {
      if (result.current.state === "ready") await result.current.addCategory("Starters");
    });
    const state = result.current;
    expect(state.state === "ready" && state.sections.map((s) => s.kind === "category" && s.category.name)).toEqual([
      "Starters",
    ]);
  });
});
