import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../db/db";
import { adoptSession } from "../db/deviceSession";
import { getScope, writeAll as storeAll, type RecordWrite } from "../db/repo";
import type { WireChange } from "./wire";
import { httpSync } from "./httpSync";

/** The server's sync contract, in memory: numbered by arrival, paged, able to refuse. */
function fakeServer() {
  const log: (WireChange & { seq: number })[] = [];
  const pushes: WireChange[][] = [];
  const state = { status: 200, refuse: new Set<string>(), pageSize: 500, onPush: undefined as (() => Promise<void>) | undefined, onPull: undefined as (() => Promise<void>) | undefined };
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

  const fetch = vi.fn(async (url: string, init: RequestInit) => {
    if (state.status !== 200) return json(state.status, { success: false });
    if (url.startsWith("/api/sync/push")) {
      const { changes } = JSON.parse(init.body as string) as { changes: WireChange[] };
      pushes.push(changes);
      if (changes.some((c) => state.refuse.has(c.record.id))) return json(409, { success: false, message: "no" });
      await state.onPush?.();
      for (const c of changes) log.push({ ...c, seq: log.length + 1 });
      return json(200, { success: true, data: { seq: log.length } });
    }
    await state.onPull?.();
    const since = Number(new URL(url, "http://x").searchParams.get("since"));
    const newer = log.filter((c) => c.seq > since);
    const page = newer.slice(0, state.pageSize);
    return json(200, { success: true, data: { changes: page, seq: page.at(-1)?.seq ?? since, more: newer.length > page.length } });
  });
  /** A change another device made. */
  const elsewhere = (c: WireChange) => log.push({ ...c, seq: log.length + 1 });
  return { fetch, log, pushes, state, elsewhere };
}

let server: ReturnType<typeof fakeServer>;

/** Stores rows of any shape, as the adapters would. */
const writeAll = (writes: { table: RecordWrite["table"]; record: { id: string; [field: string]: unknown }; op: RecordWrite["op"] }[]) =>
  storeAll(writes);

async function signIn() {
  const scope = await getScope();
  await adoptSession({ session: { email: "o@x.com" as never, restaurantName: "R" }, token: "tok", scope });
  return scope;
}

beforeEach(async () => {
  db.close();
  await Dexie.delete("tap2chef");
  await db.open();
  server = fakeServer();
  vi.stubGlobal("fetch", server.fetch);
  vi.stubGlobal("navigator", { onLine: true });
});
afterEach(() => vi.unstubAllGlobals());

describe("httpSync", () => {
  it("does nothing until signed in, and knows when it is offline", async () => {
    expect(await httpSync.run()).toEqual({ ok: false, error: "signedOut" });
    await signIn();
    vi.stubGlobal("navigator", { onLine: false });
    expect(await httpSync.run()).toEqual({ ok: false, error: "offline" });
    expect(server.fetch).not.toHaveBeenCalled();
  });

  it("sends each waiting record once, as it is now, under the device's shop and without the account", async () => {
    const { shopId } = await signIn();
    await writeAll([{ table: "items", record: { id: "i1", name: "Samosa" }, op: "put" }]);
    await writeAll([{ table: "items", record: { id: "i1", name: "Samosa (2)" }, op: "put" }]);
    await writeAll([{ table: "orders", record: { id: "o1" }, op: "put" }]);

    expect(await httpSync.run()).toEqual({ ok: true, value: undefined });
    expect(server.pushes).toHaveLength(1);
    const [item, order] = server.pushes[0]!;
    expect(item).toMatchObject({ table: "items", record: { id: "i1", name: "Samosa (2)", deleted: false } });
    expect(item!.record).not.toHaveProperty("accountId");
    expect(item!.record).not.toHaveProperty("shopId");
    expect(order).toMatchObject({ table: "orders", record: { id: "o1", shopId } });
    expect(await db.outbox.count()).toBe(0);
    expect(server.fetch.mock.calls.map(([url]) => url as string).map((u) => u.split("?")[0])).toEqual(["/api/sync/push", "/api/sync/pull"]);
  });

  it("files a record from an older build under the device's shop", async () => {
    const { shopId } = await signIn();
    await db.transaction("rw", db.expenses, db.outbox, async () => {
      await db.expenses.put({ id: "old", tenantId: "local-x", createdAt: 1, updatedAt: 1, deleted: false } as never);
      await db.outbox.add({ table: "expenses", recordId: "old", queuedAt: 1 });
    });
    await httpSync.run();
    expect(server.pushes[0]![0]!.record).toEqual({ id: "old", createdAt: 1, updatedAt: 1, deleted: false, shopId });
  });

  it("keeps a change made while a push is on its way, for the next one", async () => {
    await signIn();
    await writeAll([{ table: "items", record: { id: "i1", name: "Samosa" }, op: "put" }]);
    server.state.onPush = async () => {
      server.state.onPush = undefined;
      await writeAll([{ table: "items", record: { id: "i1", name: "Samosa (2)" }, op: "put" }]);
    };
    await httpSync.run();
    expect(server.pushes.map((p) => p[0]!.record.name)).toEqual(["Samosa", "Samosa (2)"]);
    expect(await db.outbox.count()).toBe(0);
  });

  it("brings other devices' changes, page by page, and remembers where it got to", async () => {
    const { accountId, shopId } = await signIn();
    server.state.pageSize = 2;
    server.elsewhere({ table: "items", record: { id: "i1", name: "Poha", deleted: false } });
    server.elsewhere({ table: "orders", record: { id: "o1", shopId, deleted: false } });
    server.elsewhere({ table: "items", record: { id: "i2", name: "Chai", deleted: true } });

    await httpSync.run();
    expect(await db.items.get("i1")).toMatchObject({ name: "Poha", accountId, deleted: false });
    expect(await db.items.get("i1")).not.toHaveProperty("shopId");
    expect(await db.orders.get("o1")).toMatchObject({ accountId, shopId });
    expect(await db.items.get("i2")).toMatchObject({ deleted: true });
    expect(await db.meta.get("syncCursor")).toEqual({ key: "syncCursor", value: "3" });
    expect(await db.outbox.count()).toBe(0);

    server.fetch.mockClear();
    await httpSync.run();
    expect(server.fetch.mock.calls.map(([url]) => url as string)).toEqual([expect.stringContaining("since=3")]);
  });

  it("keeps our version of a record we changed and haven't sent yet", async () => {
    await signIn();
    await writeAll([{ table: "items", record: { id: "i1", name: "Ours" }, op: "put" }]);
    server.state.status = 503;
    await httpSync.run();
    server.state.status = 200;
    server.elsewhere({ table: "items", record: { id: "i1", name: "Theirs", deleted: false } });

    // Pushed first, so ours arrives later and wins on the server too.
    await httpSync.run();
    expect((await db.items.get("i1"))!.name).toBe("Ours");
    expect(server.log.at(-1)!.record.name).toBe("Ours");
  });

  it("keeps an edit made here while the pull is on its way, over the older version it brings", async () => {
    await signIn();
    server.elsewhere({ table: "items", record: { id: "i1", name: "Theirs", deleted: false } });
    server.state.onPull = async () => {
      server.state.onPull = undefined;
      await writeAll([{ table: "items", record: { id: "i1", name: "Mine, just now" }, op: "put" }]);
    };
    await httpSync.run();
    expect((await db.items.get("i1"))!.name).toBe("Mine, just now");
    expect(await db.outbox.count()).toBe(1);
  });

  it("sets aside a record the server won't take, and sends the rest", async () => {
    await signIn();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await writeAll([
      { table: "items", record: { id: "bad" }, op: "put" },
      { table: "items", record: { id: "good" }, op: "put" },
    ]);
    server.state.refuse.add("bad");
    expect((await httpSync.run()).ok).toBe(true);
    expect(server.log.map((c) => c.record.id)).toEqual(["good"]);
    expect(await db.outbox.count()).toBe(0);
    expect(await db.items.get("bad")).toBeTruthy();
  });

  it("keeps everything waiting when the server is down", async () => {
    await signIn();
    await writeAll([{ table: "items", record: { id: "i1" }, op: "put" }]);
    server.state.status = 503;
    expect(await httpSync.run()).toEqual({ ok: false, error: "failed" });
    expect(await db.outbox.count()).toBe(1);
  });

  it("goes back to keeping work on the device when the server no longer knows it", async () => {
    await signIn();
    await writeAll([{ table: "items", record: { id: "i1" }, op: "put" }]);
    server.state.status = 401;
    expect(await httpSync.run()).toEqual({ ok: false, error: "signedOut" });
    expect(await db.meta.get("session")).toBeUndefined();
    expect(await db.meta.get("deviceToken")).toBeUndefined();
    expect(await db.items.get("i1")).toBeTruthy();
    expect(await db.outbox.count()).toBe(1);
  });

  it("counts what waits to be sent", async () => {
    await signIn();
    const counts: number[] = [];
    const stop = httpSync.subscribeWaiting((n) => counts.push(n));
    await writeAll([{ table: "items", record: { id: "i1" }, op: "put" }]);
    await vi.waitFor(() => expect(counts.at(-1)).toBe(1));
    await httpSync.run();
    await vi.waitFor(() => expect(counts.at(-1)).toBe(0));
    stop();
  });
});
