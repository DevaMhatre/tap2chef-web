import "fake-indexeddb/auto";
import Dexie from "dexie";
import { beforeEach, describe, expect, it } from "vitest";
import type { LocalSetup } from "../../usecases/ports";
import { db } from "./db";
import { dexieSetupStore } from "./dexieSetupStore";
import { dexieShopRepository } from "./dexieShopRepository";
import { getScope, writeAll } from "./repo";

beforeEach(async () => {
  db.close();
  await Dexie.delete("tap2chef");
  await db.open();
});

const next = <T,>(subscribe: (cb: (v: T) => void) => () => void, until: (v: T) => boolean) =>
  new Promise<T>((resolve) => {
    const stop = subscribe((v) => {
      if (until(v)) {
        stop();
        resolve(v);
      }
    });
  });

describe("dexieSetupStore", () => {
  it("knows an empty phone from one with records or a session", async () => {
    expect(await dexieSetupStore.isEmptyDevice()).toBe(true);
    await db.meta.put({ key: "session", value: "{}" });
    expect(await dexieSetupStore.isEmptyDevice()).toBe(false);
    await db.meta.delete("session");
    await writeAll([{ table: "diningTables", record: { id: "t1" }, op: "remove" }]);
    expect(await dexieSetupStore.isEmptyDevice()).toBe(false);
  });

  it("begins once, then keeps every answer and the card put away", async () => {
    await Promise.all([dexieSetupStore.begin({ step: "account" }), dexieSetupStore.begin({ step: "done" })]);
    await dexieSetupStore.begin({ step: "done" });
    expect((await next<LocalSetup>(dexieSetupStore.subscribe, () => true)).progress).toEqual({ step: "account" });
    await dexieSetupStore.save({ step: "service", name: "Sharma Dhaba" });
    await dexieSetupStore.dismissCard();
    const local = await next<LocalSetup>(dexieSetupStore.subscribe, (s) => s.cardDismissed);
    expect(local).toEqual({ progress: { step: "service", name: "Sharma Dhaba" }, cardDismissed: true });
    // Never synced.
    expect(await db.outbox.count()).toBe(0);
  });
});

describe("dexieShopRepository", () => {
  it("keeps one record per shop, named by it, and sends it", async () => {
    const { shopId } = await getScope();
    await dexieShopRepository.write({ name: "Sharma Dhaba", service: "dineIn" });
    await dexieShopRepository.write({ name: "Sharma Dhaba", service: "both" });
    expect(await db.shopDetails.toArray()).toEqual([expect.objectContaining({ id: shopId, shopId, name: "Sharma Dhaba", service: "both" })]);
    expect(await next(dexieShopRepository.subscribe, (d) => d !== null)).toEqual({ name: "Sharma Dhaba", service: "both" });
    expect(await db.outbox.where("table").equals("shopDetails").count()).toBe(2);
  });

  it("reads a record from another phone only if it makes sense", async () => {
    const { shopId } = await getScope();
    await db.shopDetails.put({ id: shopId, accountId: "a", shopId, name: "X", service: "drones", createdAt: 1, updatedAt: 1, deleted: false });
    expect(await next(dexieShopRepository.subscribe, () => true)).toBeNull();
  });
});

describe("a session stored before linked phones", () => {
  it("reads as the owner's email sign-in", async () => {
    const { subscribeSession } = await import("./deviceSession");
    await db.meta.put({ key: "session", value: JSON.stringify({ email: "o@x.com", restaurantName: "R" }) });
    const session = await new Promise((resolve) => {
      const stop = subscribeSession((s) => {
        if (s) {
          stop();
          resolve(s);
        }
      });
    });
    expect(session).toEqual({ via: "email", email: "o@x.com", restaurantName: "R" });
  });
});
