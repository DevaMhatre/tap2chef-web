// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { fakeAccountService, fakeClock } from "./fakes";
import type { Ports } from "./ports";
import { PortsProvider } from "./PortsProvider";
import { useDeviceSession, useSignIn } from "./useSignIn";

function setup(options: Parameters<typeof fakeAccountService>[0] = {}) {
  const server = fakeAccountService(options);
  const time = fakeClock(1_000_000);
  const ports = { account: server.service, clock: time.clock } as Partial<Ports> as Ports;
  const wrapper = ({ children }: { children: ReactNode }) => <PortsProvider ports={ports}>{children}</PortsProvider>;
  const hook = renderHook(() => ({ signIn: useSignIn(), session: useDeviceSession() }), { wrapper });
  return { server, time, ...hook };
}

async function toCode(result: { current: { signIn: ReturnType<typeof useSignIn> } }, email = "owner@example.com") {
  act(() => result.current.signIn.typeEmail(email));
  await act(() => result.current.signIn.sendCode());
}

describe("useSignIn", () => {
  it("signs a new owner in: email, code, the restaurant's name", async () => {
    const { result, server } = setup();
    expect(result.current.session).toBeNull();

    await toCode(result, " Owner@Example.com ");
    expect(server.calls.requestCode).toEqual(["owner@example.com"]);
    expect(result.current.signIn.flow).toEqual({ step: "code", email: "owner@example.com", resendAt: 1_030_000 });

    act(() => result.current.signIn.typeCode("123 45"));
    expect(server.calls.signIn).toEqual([]);
    act(() => result.current.signIn.typeCode("123 456"));
    await waitFor(() => expect(result.current.signIn.flow.step).toBe("name"));

    act(() => result.current.signIn.typeName("  Sharma  Dhaba "));
    await act(() => result.current.signIn.finish());
    expect(server.calls.signIn.at(-1)).toEqual({ email: "owner@example.com", code: "123456", name: "Sharma Dhaba" });
    expect(result.current.signIn.flow).toEqual({
      step: "done",
      session: { email: "owner@example.com", restaurantName: "Sharma Dhaba" },
    });
    expect(result.current.session).toEqual({ email: "owner@example.com", restaurantName: "Sharma Dhaba" });
  });

  it("signs a known owner straight in, without asking the name", async () => {
    const { result } = setup({ knownEmails: ["owner@example.com"] });
    await toCode(result);
    act(() => result.current.signIn.typeCode("123456"));
    await waitFor(() => expect(result.current.signIn.flow.step).toBe("done"));
  });

  it("refuses a bad email without asking the server", async () => {
    const { result, server } = setup();
    await toCode(result, "owner@");
    expect(result.current.signIn.problem).toBe("badEmail");
    expect(server.calls.requestCode).toEqual([]);
  });

  it("says when there is no internet, and stays on the email", async () => {
    const { result } = setup({ offline: true });
    await toCode(result);
    expect(result.current.signIn).toMatchObject({ problem: "offline", flow: { step: "email" }, busy: false });
  });

  it("goes on to the code already sent when asked again too soon", async () => {
    const { result, server } = setup();
    server.state.tooSoon = 12;
    await toCode(result);
    expect(result.current.signIn.flow).toEqual({ step: "code", email: "owner@example.com", resendAt: 1_012_000 });
  });

  it("clears a wrong code so the right one can be typed", async () => {
    const { result } = setup();
    await toCode(result);
    act(() => result.current.signIn.typeCode("999999"));
    await waitFor(() => expect(result.current.signIn.problem).toBe("wrongCode"));
    expect(result.current.signIn.code).toBe("");
    act(() => result.current.signIn.typeCode("1"));
    expect(result.current.signIn.problem).toBeUndefined();
  });

  it("sends another code only once the wait is over", async () => {
    const { result, server, time } = setup();
    await toCode(result);
    await act(() => result.current.signIn.resend());
    expect(server.calls.requestCode).toHaveLength(1);
    time.advance(30_000);
    await act(() => result.current.signIn.resend());
    expect(server.calls.requestCode).toHaveLength(2);
  });

  it("asks for the name before finishing", async () => {
    const { result, server } = setup();
    await toCode(result);
    act(() => result.current.signIn.typeCode("123456"));
    await waitFor(() => expect(result.current.signIn.flow.step).toBe("name"));
    await act(() => result.current.signIn.finish());
    expect(result.current.signIn.problem).toBe("noName");
    expect(server.calls.signIn).toHaveLength(1);
  });

  it("signs in once, however fast the code is finished and tapped again", async () => {
    const { result, server } = setup({ knownEmails: ["owner@example.com"] });
    await toCode(result);
    server.hold();
    act(() => {
      result.current.signIn.typeCode("123456");
      result.current.signIn.typeCode("123456");
    });
    await act(async () => server.release());
    await waitFor(() => expect(result.current.signIn.flow.step).toBe("done"));
    expect(server.calls.signIn).toHaveLength(1);
  });

  it("lets go when the sheet closes mid-request", async () => {
    const { result, server, unmount } = setup({ knownEmails: ["owner@example.com"] });
    await toCode(result);
    server.hold();
    act(() => result.current.signIn.typeCode("123456"));
    unmount();
    await act(async () => server.release());
    expect(server.calls.signIn).toHaveLength(1);
  });
});
