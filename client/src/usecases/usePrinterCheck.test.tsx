// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Ports, PrinterTry } from "./ports";
import { PortsProvider } from "./PortsProvider";
import { usePrinterCheck } from "./usePrinterCheck";

function render(answer: () => Promise<PrinterTry>) {
  let calls = 0;
  const printer = { tryPrint: () => ((calls += 1), answer()) };
  const wrapper = ({ children }: { children: ReactNode }) => <PortsProvider ports={{ printer } as Partial<Ports> as Ports}>{children}</PortsProvider>;
  return { calls: () => calls, ...renderHook(() => usePrinterCheck(), { wrapper }) };
}

describe("usePrinterCheck", () => {
  it("tries one route at a time, however fast the taps, and keeps each answer", async () => {
    const { result, calls } = render(async () => ({ outcome: "printed", name: "EZO 58D", detail: "Bluetooth LE" }));
    await act(() => Promise.all([result.current.tryRoute("bluetooth"), result.current.tryRoute("usb")]));
    expect(calls()).toBe(1);
    expect(result.current.results).toEqual({ bluetooth: { outcome: "printed", name: "EZO 58D", detail: "Bluetooth LE" } });
    expect(result.current.trying).toBeUndefined();
  });

  it("says a failure instead of throwing", async () => {
    const { result } = render(() => Promise.reject(new Error("GATT Server is disconnected")));
    await act(() => result.current.tryRoute("bluetooth"));
    expect(result.current.results.bluetooth).toEqual({ outcome: "failed", detail: "Error: GATT Server is disconnected" });
  });
});
