// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { RepaymentId } from "../domain/dues";
import { paise } from "../domain/money";
import type { OrderId, Payment, PaymentId } from "../domain/order";
import { fakeClock, fakeDuesRepository, fakeIds } from "./fakes";
import type { RoleId } from "../domain/access";
import type { DeviceSession, Email } from "../domain/signIn";
import type { AccountService, Ports } from "./ports";
import { PortsProvider } from "./PortsProvider";
import { useDues } from "./useDues";

const SHARMA = "9876543210";
const MEHTA = "9123456780";
const later = (id: string, customer: string, rupees: number, at: number, phone = SHARMA): Payment =>
  ({ id: id as PaymentId, orderId: `o-${id}` as OrderId, amount: paise(rupees * 100), receivedAt: at, method: "later", customer, phone }) as Payment;

/** Who works this phone: the owner signed in by email, or a waiter's phone. */
const owner: DeviceSession = { via: "email", email: "o@example.com" as Email, restaurantName: "Sharma Dhaba" };
const waiter: DeviceSession = { via: "link", restaurantName: "Sharma Dhaba", person: { name: "Ravi", roleId: "staff" as RoleId } };
const accountOf = (session: DeviceSession) =>
  ({ subscribe: (onChange: (s: DeviceSession) => void) => (onChange(session), () => undefined) }) as unknown as AccountService;

function renderDues(payments: Payment[], session: DeviceSession = owner) {
  const dues = fakeDuesRepository({ later: payments });
  const subscribed = { count: 0 };
  const repository = { ...dues.repository, subscribe: (cb: Parameters<typeof dues.repository.subscribe>[0]) => (subscribed.count++, dues.repository.subscribe(cb)) };
  const ports = {
    account: accountOf(session),
    dues: repository,
    ids: fakeIds(),
    clock: fakeClock(new Date(2026, 9, 30, 13, 0).getTime()).clock,
  } as Partial<Ports> as Ports;
  const wrapper = ({ children }: { children: ReactNode }) => <PortsProvider ports={ports}>{children}</PortsProvider>;
  return { dues, subscribed, ...renderHook(() => useDues(), { wrapper }) };
}

const ready = <T extends { state: string }>(screen: T) => {
  if (screen.state !== "ready") throw new Error(`Not ready: ${screen.state}`);
  return screen as Extract<T, { state: "ready" }>;
};

describe("useDues", () => {
  it("never reads the dues on a waiter's phone", async () => {
    const { result, subscribed } = renderDues([later("a", "Sharma ji", 300, 1)], waiter);
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current.state).toBe("loading");
    expect(subscribed.count).toBe(0);
  });

  it("lists who owes, and offers the names on the bill", async () => {
    const { result } = renderDues([later("a", "Sharma ji", 300, 1), later("b", "Mehta", 100, 2, MEHTA)]);
    await waitFor(() => expect(result.current.state).toBe("ready"));
    expect(ready(result.current).total).toBe(40000);
    expect(ready(result.current).regulars).toEqual([
      { name: "Mehta", phone: MEHTA },
      { name: "Sharma ji", phone: SHARMA },
    ]);
    expect(ready(result.current).today).toBe("2026-10-30");
  });

  it("takes part of it back, then the rest with change; a double tap records it once; undo takes it back", async () => {
    const { result, dues } = renderDues([later("a", "Sharma ji", 300, 1)]);
    await waitFor(() => expect(result.current.state).toBe("ready"));
    const id = ready(result.current).newId();
    await act(async () => {
      const [first, second] = await Promise.all([
        ready(result.current).receive(id, SHARMA, "upi", "100"),
        ready(result.current).receive(id, SHARMA, "upi", "100"),
      ]);
      expect(first).toMatchObject({ ok: true, value: { repayment: { amount: 10000, customer: "Sharma ji", businessDate: "2026-10-30" } } });
      expect(second.ok).toBe(true);
    });
    expect(dues.current().repayments).toHaveLength(1);
    expect(ready(result.current).total).toBe(20000);

    let undo: (() => Promise<void>) | undefined;
    await act(async () => {
      const rest = await ready(result.current).receive(ready(result.current).newId(), SHARMA, "cash", "500");
      expect(rest).toMatchObject({ ok: true, value: { change: 30000, repayment: { amount: 20000 } } });
      if (rest.ok) undo = rest.value.undo;
    });
    expect(ready(result.current).dues).toEqual([]);
    await act(async () => {
      await undo!();
    });
    expect(ready(result.current).total).toBe(20000);
  });

  it("refuses money for someone who owes nothing, and a typo", async () => {
    const { result } = renderDues([later("a", "Sharma ji", 300, 1)]);
    await waitFor(() => expect(result.current.state).toBe("ready"));
    expect(await ready(result.current).receive("r1" as RepaymentId, MEHTA, "cash", "100")).toEqual({ ok: false, error: "nothingOwed" });
    expect(await ready(result.current).receive("r2" as RepaymentId, SHARMA, "cash", "12abc")).toEqual({ ok: false, error: "invalid" });
    expect(await ready(result.current).receive("r3" as RepaymentId, SHARMA, "upi", "400")).toEqual({ ok: false, error: "moreThanDue" });
  });
});
