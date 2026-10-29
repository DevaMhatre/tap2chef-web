import { jest } from "@jest/globals";
import jwt from "jsonwebtoken";
import request from "supertest";
import app from "../app.js";
import Member from "../models/Member.js";
import SyncRecord from "../models/SyncRecord.js";
import { PULL_LIMIT } from "../controllers/syncController.js";
import { connect, closeDatabase, clearDatabase } from "./helpers/db.js";
import { addMember, addShop, createAccount, deviceToken } from "./helpers/tenancy.js";

beforeAll(connect);
afterEach(clearDatabase);
afterAll(closeDatabase);

const as = (token) => ({
  push: (changes) => request(app).post("/api/sync/push").set("Authorization", `Bearer ${token}`).send({ changes }),
  pull: (shopId, since = 0) =>
    request(app).get("/api/sync/pull").query({ shopId, since }).set("Authorization", `Bearer ${token}`),
});

const item = (id, over = {}) => ({ table: "items", record: { id, name: "Samosa", ...over } });
const order = (id, shopId, over = {}) => ({ table: "orders", record: { id, shopId, status: "open", ...over } });

async function ownerDevice(name) {
  const { accountId, shopId, owner } = await createAccount(name);
  return { accountId, shopId, device: as(deviceToken(accountId, owner._id)) };
}

describe("tenant isolation", () => {
  it("never lets one account read another's records", async () => {
    const a = await ownerDevice("A");
    const b = await ownerDevice("B");
    await a.device.push([item("i1"), order("o1", a.shopId)]).expect(200);
    await b.device.push([item("i2")]).expect(200);

    const pulledByB = (await b.device.pull(b.shopId).expect(200)).body.data.changes;
    expect(pulledByB.map((c) => c.record.id)).toEqual(["i2"]);
    // B can't pull A's shop either.
    await b.device.pull(a.shopId).expect(404);
  });

  it("files a record under the token's account, whatever the record claims", async () => {
    const a = await ownerDevice("A");
    const b = await ownerDevice("B");
    await b.device.push([item("i9", { accountId: a.accountId })]).expect(200);

    expect((await a.device.pull(a.shopId)).body.data.changes).toEqual([]);
    const stored = await SyncRecord.findOne({ accountId: b.accountId, id: "i9" }).lean();
    expect(stored.data).not.toHaveProperty("accountId");
  });

  it("keeps two accounts' records apart even with the same ids", async () => {
    const a = await ownerDevice("A");
    const b = await ownerDevice("B");
    await a.device.push([item("same", { name: "Samosa" })]).expect(200);
    await b.device.push([item("same", { name: "Poha" })]).expect(200);
    expect((await a.device.pull(a.shopId)).body.data.changes[0].record.name).toBe("Samosa");
    expect((await b.device.pull(b.shopId)).body.data.changes[0].record.name).toBe("Poha");
  });

  it("never lets a record move to another shop", async () => {
    const { accountId, shopId, device } = await ownerDevice("A");
    const other = await addShop(accountId, "A2");
    await device.push([order("o1", other._id, { status: "open" })]).expect(200);
    await device.push([order("o1", shopId, { status: "settled" })]).expect(409);
    const [kept] = (await device.pull(other._id)).body.data.changes;
    expect(kept.record).toMatchObject({ shopId: other._id, status: "open" });
  });

  it("refuses to write into another account's shop", async () => {
    const a = await ownerDevice("A");
    const b = await ownerDevice("B");
    await b.device.push([order("o1", a.shopId)]).expect(404);
    expect(await SyncRecord.countDocuments({ accountId: a.accountId })).toBe(0);
  });

  it("refuses a query that doesn't name its account", async () => {
    await expect(SyncRecord.find({ id: "x" })).rejects.toThrow("without accountId");
    await expect(SyncRecord.updateMany({}, { deleted: true })).rejects.toThrow("without accountId");
    await expect(SyncRecord.aggregate([{ $match: { id: "x" } }])).rejects.toThrow("without accountId");
    await expect(
      SyncRecord.bulkWrite([{ updateOne: { filter: { id: "x" }, update: { deleted: true } } }]),
    ).rejects.toThrow("without accountId");
  });
});

describe("devices", () => {
  it("needs a device token", async () => {
    const { accountId, shopId, owner } = await createAccount();
    await request(app).get("/api/sync/pull").query({ shopId }).expect(401);
    await as("garbage").pull(shopId).expect(401);
    const userToken = jwt.sign({ id: owner._id, role: "owner" }, process.env.JWT_SECRET);
    await as(userToken).pull(shopId).expect(401);
    await as(deviceToken(accountId, "nobody")).pull(shopId).expect(401);
  });

  it("signs out a device whose member has left", async () => {
    const { accountId, shopId } = await createAccount();
    const ravi = await addMember(accountId, { name: "Ravi", roleId: "staff" });
    await Member.updateOne({ accountId, _id: ravi._id }, { removedAt: 5 });
    await as(deviceToken(accountId, ravi._id)).pull(shopId).expect(401);
  });
});

describe("push and pull", () => {
  it("hands back changes in arrival order, the last arrival winning", async () => {
    const { shopId, device } = await ownerDevice("A");
    await device.push([item("i1", { name: "Samosa" }), order("o1", shopId)]).expect(200);
    const res = await device.push([item("i1", { name: "Samosa (2)" })]).expect(200);
    expect(res.body.data.seq).toBe(3);

    const { changes, seq, more } = (await device.pull(shopId)).body.data;
    expect(changes.map((c) => [c.record.id, c.seq])).toEqual([["o1", 2], ["i1", 3]]);
    expect(changes[1].record).toEqual({ id: "i1", name: "Samosa (2)", deleted: false });
    expect(changes[0].record).toMatchObject({ id: "o1", shopId, status: "open" });
    expect([seq, more]).toEqual([3, false]);
    expect((await device.pull(shopId, 3)).body.data).toEqual({ changes: [], seq: 3, more: false });
  });

  it("carries a deletion to other devices", async () => {
    const { shopId, device } = await ownerDevice("A");
    await device.push([item("i1")]).expect(200);
    await device.push([item("i1", { deleted: true })]).expect(200);
    const [change] = (await device.pull(shopId, 1)).body.data.changes;
    expect(change.record.deleted).toBe(true);
  });

  it("gives a shop only its own service, and the menu every shop shares", async () => {
    const { accountId, shopId, device } = await ownerDevice("A");
    const second = await addShop(accountId, "A2");
    await device.push([item("i1"), order("here", shopId), order("there", second._id)]).expect(200);

    const pulled = (await device.pull(shopId)).body.data;
    expect(pulled.changes.map((c) => c.record.id)).toEqual(["i1", "here"]);
    expect(pulled.seq).toBe(2);
    expect((await device.pull(second._id)).body.data.changes.map((c) => c.record.id)).toEqual(["i1", "there"]);
  });

  it("pages a long history", async () => {
    const { shopId, device } = await ownerDevice("A");
    const all = Array.from({ length: PULL_LIMIT + 20 }, (_, i) => item(`i${i}`));
    await device.push(all.slice(0, 500)).expect(200);
    await device.push(all.slice(500)).expect(200);

    const first = (await device.pull(shopId)).body.data;
    expect([first.changes.length, first.seq, first.more]).toEqual([PULL_LIMIT, PULL_LIMIT, true]);
    const rest = (await device.pull(shopId, first.seq)).body.data;
    expect([rest.changes.length, rest.more]).toEqual([20, false]);
  });

  it("never lets a pull pass a change still being written by another push", async () => {
    const { shopId, device } = await ownerDevice("A");
    // The first push is slow to write (a big batch, a busy disk); a second
    // arrives meanwhile, and a device pulls before the first one lands.
    const write = SyncRecord.bulkWrite.bind(SyncRecord);
    let calls = 0;
    const spy = jest.spyOn(SyncRecord, "bulkWrite").mockImplementation(async (ops, options) => {
      calls += 1;
      if (calls === 1) await new Promise((r) => setTimeout(r, 300));
      return write(ops, options);
    });
    try {
      // supertest sends a request only once something awaits it.
      const slow = Promise.resolve(device.push([item("a1"), item("a2")]).expect(200));
      await new Promise((r) => setTimeout(r, 50));
      const quick = Promise.resolve(device.push([item("b1")]).expect(200));
      await new Promise((r) => setTimeout(r, 100));

      const early = (await device.pull(shopId)).body.data;
      await Promise.all([slow, quick]);
      const late = (await device.pull(shopId, early.seq)).body.data;

      const seen = [...early.changes, ...late.changes].map((c) => c.record.id);
      expect(seen.sort()).toEqual(["a1", "a2", "b1"]);
    } finally {
      spy.mockRestore();
    }
  });

  it("refuses a malformed batch, and writes none of it", async () => {
    const { shopId, device } = await ownerDevice("A");
    await device.push([]).expect(400);
    await device.push([{ table: "secrets", record: { id: "x" } }]).expect(400);
    await device.push([item("ok"), { table: "items", record: { name: "no id" } }]).expect(400);
    await device.push([item("ok"), item("bad", { prices: { $where: "1" } })]).expect(400);
    await device.push([item("ok"), item("bad", { "a.b": 1 })]).expect(400);
    await device.push([order("o1", undefined)]).expect(400);
    await device.push([item("ok"), item("x", { shopId })]).expect(400);
    await device.push(Array.from({ length: 501 }, (_, i) => item(`i${i}`))).expect(400);
    expect((await device.pull(shopId)).body.data.changes).toEqual([]);
  });

  it("refuses a bad pull", async () => {
    const { shopId, device } = await ownerDevice("A");
    await device.pull(undefined).expect(400);
    await device.pull(shopId, -1).expect(400);
    await device.pull(shopId, "abc").expect(400);
  });
});

describe("permissions", () => {
  async function memberDevice(roleId, scope) {
    const { accountId, shopId } = await createAccount("A");
    const m = await addMember(accountId, { name: "Ravi", roleId, scope: scope?.(shopId) });
    return { accountId, shopId, device: as(deviceToken(accountId, m._id)) };
  }

  it("lets staff run the service but not change the menu, the tables or the drawer", async () => {
    const { shopId, device } = await memberDevice("staff");
    await device.push([order("o1", shopId), { table: "payments", record: { id: "p1", shopId } }]).expect(200);
    await device.push([item("i1")]).expect(403);
    await device.push([{ table: "diningTables", record: { id: "t1", shopId } }]).expect(403);
    await device.push([order("o2", shopId), { table: "drawerEntries", record: { id: "d1", shopId } }]).expect(403);
    expect((await device.pull(shopId)).body.data.changes.map((c) => c.record.id)).toEqual(["o1", "p1"]);
  });

  it("keeps a one-shop manager to that shop and off the account's menu", async () => {
    const { accountId, shopId, device } = await memberDevice("manager", (shopId) => ({ kind: "shop", shopId }));
    const other = await addShop(accountId, "A2");
    await device.push([{ table: "diningTables", record: { id: "t1", shopId } }]).expect(200);
    await device.push([order("o1", other._id)]).expect(403);
    await device.pull(other._id).expect(403);
    await device.push([item("i1")]).expect(403);
  });

  it("lets a manager over all shops edit the menu", async () => {
    const { device } = await memberDevice("manager");
    await device.push([item("i1")]).expect(200);
  });
});
