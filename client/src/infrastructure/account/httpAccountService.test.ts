import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DeviceSession, Email } from "../../domain/signIn";
import { db } from "../db/db";
import { getScope, writeAll } from "../db/repo";
import { httpAccountService } from "./httpAccountService";

const email = "owner@example.com" as Email;
const reply = (status: number, body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));

function sessions(): Promise<(DeviceSession | null)[]> {
  return new Promise((resolve) => {
    const seen: (DeviceSession | null)[] = [];
    const stop = httpAccountService.subscribe((s) => {
      seen.push(s);
      if (s) {
        stop();
        resolve(seen);
      }
    });
  });
}

beforeEach(async () => {
  db.close();
  await Dexie.delete("tap2chef");
  await db.open();
  vi.stubGlobal("navigator", { onLine: true });
});
afterEach(() => vi.unstubAllGlobals());

describe("httpAccountService", () => {
  it("sends the device's own ids, and a new owner's records stay where they are", async () => {
    const scope = await getScope();
    await writeAll([{ table: "orders", record: { id: "o1" }, op: "put" }]);
    const fetch = reply(200, { success: true, data: { token: "t", ...scope, restaurantName: "Sharma Dhaba", email } });
    vi.stubGlobal("fetch", fetch);

    const watching = sessions();
    const result = await httpAccountService.signIn(email, "123456", "Sharma Dhaba");
    expect(result).toEqual({ ok: true, value: { kind: "signedIn", session: { email, restaurantName: "Sharma Dhaba" } } });
    expect(JSON.parse((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toEqual({
      email, code: "123456", device: scope, restaurantName: "Sharma Dhaba",
    });
    expect(await db.orders.get("o1")).toMatchObject(scope);
    expect(await db.meta.get("deviceToken")).toEqual({ key: "deviceToken", value: "t" });
    expect((await watching).at(-1)).toEqual({ email, restaurantName: "Sharma Dhaba" });
  });

  it("brings the device's records into an existing account", async () => {
    await writeAll([
      { table: "items", record: { id: "i1" }, op: "put" },
      { table: "payments", record: { id: "p1" }, op: "put" },
    ]);
    vi.stubGlobal("fetch", reply(200, { data: { token: "t", accountId: "acc", shopId: "shop", restaurantName: "R", email } }));

    await httpAccountService.signIn(email, "123456", undefined);
    expect(await getScope()).toEqual({ accountId: "acc", shopId: "shop" });
    expect(await db.items.get("i1")).toMatchObject({ accountId: "acc" });
    expect(await db.items.get("i1")).not.toHaveProperty("shopId");
    expect(await db.payments.get("p1")).toMatchObject({ accountId: "acc", shopId: "shop" });
    expect(await db.outbox.count()).toBe(2);
  });

  it("asks for the name when the server does", async () => {
    vi.stubGlobal("fetch", reply(200, { success: true, data: { needsName: true } }));
    expect(await httpAccountService.signIn(email, "123456", undefined)).toEqual({ ok: true, value: { kind: "needsName" } });
    expect(await db.meta.get("session")).toBeUndefined();
  });

  it("reads the server's reasons, and anything else as a failure", async () => {
    vi.stubGlobal("fetch", reply(400, { success: false, reason: "wrongCode" }));
    expect(await httpAccountService.signIn(email, "000000", undefined)).toEqual({ ok: false, error: "wrongCode" });
    vi.stubGlobal("fetch", reply(429, { success: false, reason: "tooSoon", retryIn: 12 }));
    expect(await httpAccountService.requestCode(email)).toEqual({ ok: false, error: { kind: "tooSoon", retryIn: 12 } });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>Bad Gateway</html>", { status: 502 })));
    expect(await httpAccountService.requestCode(email)).toEqual({ ok: false, error: { kind: "failed" } });
    vi.stubGlobal("fetch", reply(200, { data: { token: 5 } }));
    expect(await httpAccountService.signIn(email, "123456", undefined)).toEqual({ ok: false, error: "failed" });
  });

  it("knows it is offline without trying, or when the network never answers", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    vi.stubGlobal("navigator", { onLine: false });
    expect(await httpAccountService.requestCode(email)).toEqual({ ok: false, error: { kind: "offline" } });
    expect(fetch).not.toHaveBeenCalled();

    vi.stubGlobal("navigator", { onLine: true });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    expect(await httpAccountService.signIn(email, "123456", undefined)).toEqual({ ok: false, error: "offline" });
  });
});
