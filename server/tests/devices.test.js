import { jest } from "@jest/globals";
import request from "supertest";
import app from "../app.js";
import Device from "../models/Device.js";
import LinkCode from "../models/LinkCode.js";
import { LINK_CODE_LIFETIME_MS } from "../controllers/deviceController.js";
import { connect, closeDatabase, clearDatabase } from "./helpers/db.js";
import { addShop, createAccount, legacyToken, phoneToken } from "./helpers/tenancy.js";

beforeAll(connect);
afterEach(async () => {
  jest.useRealTimers();
  await clearDatabase();
});
afterAll(closeDatabase);

const as = (token) => ({
  code: () => request(app).post("/api/devices/link-code").set("Authorization", `Bearer ${token}`),
  list: () => request(app).get("/api/devices").set("Authorization", `Bearer ${token}`),
  remove: (id) => request(app).delete(`/api/devices/${id}`).set("Authorization", `Bearer ${token}`),
  pull: (shopId, since = 0) => request(app).get("/api/sync/pull").query({ shopId, since }).set("Authorization", `Bearer ${token}`),
  push: (changes) => request(app).post("/api/sync/push").set("Authorization", `Bearer ${token}`).send({ changes }),
});
const join = (code, confirm, label = "Android phone") => request(app).post("/api/devices/join").send({ code, confirm, label });
const details = (shopId, name) => ({ table: "shopDetails", record: { id: shopId, shopId, name, service: "both" } });

async function ownerPhone(name = "Sharma Dhaba") {
  const { accountId, brandId, shopId, owner } = await createAccount(name);
  const { token, deviceId } = await phoneToken(accountId, owner._id, { label: "iPhone" });
  return { accountId, brandId, shopId, owner, deviceId, phone: as(token) };
}

/** A waiter's phone joined with a code from the owner's phone. */
async function linkedPhone(owner) {
  const { code } = (await owner.phone.code().expect(200)).body.data;
  const joined = (await join(code, true).expect(200)).body.data;
  return { ...joined, phone: as(joined.token) };
}

describe("adding a phone", () => {
  it("shows a 6-digit code; the new phone learns whose it is, then joins once", async () => {
    const owner = await ownerPhone();
    await owner.phone.push([details(owner.shopId, "Sharma Dhaba Express")]).expect(200);
    const { code, expiresAt } = (await owner.phone.code().expect(200)).body.data;
    expect(code).toMatch(/^\d{6}$/);
    expect(expiresAt - Date.now()).toBeGreaterThan(LINK_CODE_LIFETIME_MS - 5000);
    expect(await LinkCode.findOne({ shopId: owner.shopId }).lean()).not.toHaveProperty("code");

    expect((await join(code, false).expect(200)).body.data).toEqual({ restaurantName: "Sharma Dhaba Express" });
    const joined = (await join(code, true).expect(200)).body.data;
    expect(joined).toMatchObject({ accountId: owner.accountId, brandId: owner.brandId, shopId: owner.shopId, restaurantName: "Sharma Dhaba Express" });
    expect((await join(code, true).expect(400)).body.reason).toBe("wrongCode");

    // It works the restaurant at once.
    const waiter = as(joined.token);
    await waiter.push([{ table: "orders", record: { id: "o1", shopId: owner.shopId } }]).expect(200);
    expect((await waiter.pull(owner.shopId)).body.data.changes.map((c) => c.record.id)).toEqual([owner.shopId, "o1"]);
  });

  it("lets one phone in however fast Join is tapped twice", async () => {
    const owner = await ownerPhone();
    const { code } = (await owner.phone.code()).body.data;
    const results = await Promise.all([join(code, true), join(code, true)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
    expect(await Device.countDocuments({ accountId: owner.accountId, kind: "linked" })).toBe(1);
  });

  it("keeps one live code per shop, and none after 10 minutes", async () => {
    const owner = await ownerPhone();
    const first = (await owner.phone.code()).body.data.code;
    const second = (await owner.phone.code()).body.data.code;
    if (first !== second) await join(first, false).expect(400);
    await LinkCode.updateOne({ shopId: owner.shopId }, { expiresAt: new Date(Date.now() - 1) });
    await join(second, false).expect(400);
  });

  it("refuses a code that isn't 6 digits", async () => {
    await join("12345", false).expect(400);
    await join("abcdef", true).expect(400);
  });
});

describe("the owner's phone, and only it", () => {
  it("lists this shop's phones with this one marked, and removes another for good", async () => {
    const owner = await ownerPhone();
    const waiter = await linkedPhone(owner);

    const { devices } = (await owner.phone.list().expect(200)).body.data;
    expect(devices.map((d) => [d.label, d.kind, d.current])).toEqual([["iPhone", "owner", true], ["Android phone", "linked", false]]);
    const waiterId = devices[1].id;

    await owner.phone.remove(owner.deviceId).expect(409);
    await owner.phone.remove(waiterId).expect(200);
    const refused = await waiter.phone.pull(owner.shopId).expect(401);
    expect(refused.body.reason).toBe("removed");
    expect((await owner.phone.list()).body.data.devices).toHaveLength(1);
    await owner.phone.remove(waiterId).expect(404);
  });

  it("never lets a linked phone add or remove phones, or change the restaurant's details", async () => {
    const owner = await ownerPhone();
    const waiter = await linkedPhone(owner);
    expect((await waiter.phone.code().expect(403)).body.reason).toBe("notOwnerPhone");
    await waiter.phone.list().expect(403);
    await waiter.phone.remove(owner.deviceId).expect(403);
    await waiter.phone.push([details(owner.shopId, "Hacked")]).expect(403);
    await owner.phone.push([details(owner.shopId, "Sharma Dhaba")]).expect(200);
  });

  it("keeps phones to their own account and shop", async () => {
    const a = await ownerPhone("A");
    const b = await ownerPhone("B");
    await b.phone.remove(a.deviceId).expect(404);
    const other = await addShop(a.accountId, "A2");
    const { deviceId } = await phoneToken(a.accountId, a.owner._id, { shopId: other._id });
    expect((await a.phone.list()).body.data.devices.map((d) => d.id)).not.toContain(deviceId);
    await a.phone.remove(deviceId).expect(404);
  });
});

describe("a phone signed in before phones had records", () => {
  it("gets its record and a token naming it on its next sync, once", async () => {
    const { accountId, shopId, owner } = await createAccount();
    const old = as(legacyToken(accountId, owner._id));
    const first = (await old.pull(shopId).expect(200)).body.data;
    expect(typeof first.token).toBe("string");
    await old.pull(shopId).expect(200);
    expect(await Device.countDocuments({ accountId })).toBe(1);

    const renewed = as(first.token);
    expect((await renewed.pull(shopId).expect(200)).body.data).not.toHaveProperty("token");
    const [listed] = (await renewed.list().expect(200)).body.data.devices;
    expect(listed).toMatchObject({ kind: "owner", current: true });
  });

  it("is signed out by Remove, with its old token too", async () => {
    const owner = await ownerPhone();
    const oldToken = legacyToken(owner.accountId, owner.owner._id);
    await as(oldToken).pull(owner.shopId).expect(200);
    const old = (await owner.phone.list()).body.data.devices.find((d) => !d.current);
    await owner.phone.remove(old.id).expect(200);
    expect((await as(oldToken).pull(owner.shopId).expect(401)).body.reason).toBe("removed");
  });
});
