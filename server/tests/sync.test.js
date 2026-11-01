import { jest } from "@jest/globals";
import jwt from "jsonwebtoken";
import request from "supertest";
import app from "../app.js";
import Member from "../models/Member.js";
import SyncRecord from "../models/SyncRecord.js";
import { PULL_LIMIT } from "../controllers/syncController.js";
import { connect, closeDatabase, clearDatabase } from "./helpers/db.js";
import { addBrand, addMember, addShop, createAccount, legacyToken, phoneToken } from "./helpers/tenancy.js";

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
  const { accountId, brandId, shopId, owner } = await createAccount(name);
  return { accountId, brandId, shopId, device: as((await phoneToken(accountId, owner._id)).token) };
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
    await as(legacyToken(accountId, "nobody")).pull(shopId).expect(401);
  });

  it("signs out a device whose member has left", async () => {
    const { accountId, shopId } = await createAccount();
    const ravi = await addMember(accountId, { name: "Ravi", roleId: "staff" });
    await Member.updateOne({ accountId, _id: ravi._id }, { removedAt: 5 });
    await as((await phoneToken(accountId, ravi._id)).token).pull(shopId).expect(401);
  });
});

describe("push and pull", () => {
  it("hands back changes in arrival order, the last arrival winning", async () => {
    const { brandId, shopId, device } = await ownerDevice("A");
    await device.push([item("i1", { name: "Samosa" }), order("o1", shopId)]).expect(200);
    const res = await device.push([item("i1", { name: "Samosa (2)" })]).expect(200);
    expect(res.body.data.seq).toBe(3);

    const { changes, seq, more } = (await device.pull(shopId)).body.data;
    expect(changes.map((c) => [c.record.id, c.seq])).toEqual([["o1", 2], ["i1", 3]]);
    expect(changes[1].record).toEqual({ id: "i1", name: "Samosa (2)", brandId, deleted: false });
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

  it("gives a shop its own brand's menu, never another brand's", async () => {
    const { accountId, brandId, shopId, device } = await ownerDevice("A");
    const cafe = await addBrand(accountId, "Cafe");
    const cafeShop = await addShop(accountId, "Cafe", cafe._id);
    await device.push([item("biryani", { brandId }), item("latte", { brandId: cafe._id })]).expect(200);

    expect((await device.pull(shopId)).body.data.changes.map((c) => [c.record.id, c.record.brandId])).toEqual([["biryani", brandId]]);
    expect((await device.pull(cafeShop._id)).body.data.changes.map((c) => c.record.id)).toEqual(["latte"]);
  });

  it("files a menu record from a device built before brands under the account's first brand", async () => {
    const { accountId, brandId, device } = await ownerDevice("A");
    await device.push([item("i1")]).expect(200);
    const stored = await SyncRecord.findOne({ accountId, id: "i1" }).lean();
    expect(stored).toMatchObject({ brandId: accountId });
    expect(stored).not.toHaveProperty("shopId");
    expect(brandId).toBe(accountId);
  });

  it("never lets a menu record move to another brand, or a brand's record belong to a shop", async () => {
    const { accountId, brandId, shopId, device } = await ownerDevice("A");
    const cafe = await addBrand(accountId, "Cafe");
    await device.push([item("i1", { brandId, name: "Samosa" })]).expect(200);
    await device.push([item("i1", { brandId: cafe._id, name: "Latte" })]).expect(409);
    await device.push([order("o1", shopId, { brandId })]).expect(400);
    const stored = await SyncRecord.findOne({ accountId, id: "i1" }).lean();
    expect(stored).toMatchObject({ brandId, data: { name: "Samosa" } });
  });

  it("refuses a menu record for a brand that isn't the account's", async () => {
    const a = await ownerDevice("A");
    const b = await ownerDevice("B");
    await b.device.push([item("i1", { brandId: a.brandId })]).expect(404);
    await b.device.push([item("i1", { brandId: "made-up" })]).expect(404);
    expect(await SyncRecord.countDocuments({ accountId: a.accountId })).toBe(0);
    expect(await SyncRecord.countDocuments({ accountId: b.accountId })).toBe(0);
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
    return { accountId, shopId, device: as((await phoneToken(accountId, m._id)).token) };
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

  it("lets only a manager or the owner put a bill on a regular's name, or take it back; staff may still move one", async () => {
    const staff = await memberDevice("staff");
    const later = (id, over = {}) => ({ table: "payments", record: { id, shopId: staff.shopId, method: "later", customer: "Sharma ji", phone: "9876543210", ...over } });
    await staff.device.push([later("p1")]).expect(403);
    await staff.device.push([{ table: "repayments", record: { id: "r1", shopId: staff.shopId } }]).expect(403);
    await staff.device.push([{ table: "payments", record: { id: "p2", shopId: staff.shopId, method: "cash" } }]).expect(200);
    await staff.device.push([later("p2")]).expect(403); // cash turned later

    const manager = await addMember(staff.accountId, { name: "Asha", roleId: "manager" });
    const boss = as((await phoneToken(staff.accountId, manager._id)).token);
    await boss.push([later("p3"), { table: "repayments", record: { id: "r1", shopId: staff.shopId } }]).expect(200);
    // Two orders at one table joined on a waiter's phone: the bill moves, still on the name.
    await staff.device.push([later("p3", { orderId: "o9" })]).expect(200);
  });

  it("lets only the owner give or change a discount; staff carry one already agreed", async () => {
    const { accountId, shopId, owner } = await createAccount("D");
    const staffMember = await addMember(accountId, { name: "Ravi", roleId: "staff" });
    const staff = as((await phoneToken(accountId, staffMember._id)).token);
    const managerMember = await addMember(accountId, { name: "Asha", roleId: "manager" });
    const manager = as((await phoneToken(accountId, managerMember._id)).token);
    const boss = as((await phoneToken(accountId, owner._id)).token);
    const billed = (discount) => order("o1", shopId, { status: "billed", state: { status: "billed", billedAt: 1, ...(discount && { discount }) } });

    await staff.push([billed({ amount: 5000, reason: "" })]).expect(403);
    await manager.push([billed({ amount: 5000, reason: "" })]).expect(403);
    await boss.push([billed({ amount: 5000, reason: "Regular" })]).expect(200);
    // Settling it on a waiter's phone carries the discount unchanged.
    await staff.push([order("o1", shopId, { status: "settled", state: { status: "settled", billedAt: 1, settledAt: 2, subtotal: 30000, discount: { amount: 5000, reason: "Regular" } } })]).expect(200);
    await staff.push([billed({ amount: 9000, reason: "Regular" })]).expect(403);
    // One more dish drops the discount: anyone may.
    await staff.push([order("o1", shopId, { status: "open", state: { status: "open" } })]).expect(200);
  });

  it("lets only a manager put a payment's method right or take a payment or an expense off", async () => {
    const { accountId, shopId } = await createAccount("C");
    const device = async (roleId) => as((await phoneToken(accountId, (await addMember(accountId, { name: roleId, roleId }))._id)).token);
    const [staff, manager] = [await device("staff"), await device("manager")];
    const payment = (over = {}) => ({ table: "payments", record: { id: "p1", shopId, orderId: "o1", amount: 22000, method: "cash", receivedAt: 1, ...over } });
    const expense = (over = {}) => ({ table: "expenses", record: { id: "e1", shopId, amount: 5000, method: "cash", ...over } });

    await staff.push([payment(), expense()]).expect(200);
    await staff.push([payment({ method: "upi", correctedAt: 2 })]).expect(403);
    await staff.push([payment({ removedAt: 2 })]).expect(403);
    await staff.push([expense({ removedAt: 2 })]).expect(403);
    // Moved onto the table's other order (two phones joined): nothing about the money changed.
    await staff.push([payment({ orderId: "o2" })]).expect(200);

    await manager.push([payment({ orderId: "o2", method: "upi", correctedAt: 2 })]).expect(200);
    await manager.push([payment({ orderId: "o2", method: "upi", correctedAt: 2, removedAt: 3 })]).expect(200);
    await manager.push([payment({ orderId: "o2", method: "upi", correctedAt: 2 })]).expect(200); // Undo puts it back
    await manager.push([expense({ removedAt: 2 })]).expect(200);
  });

  it("lets a waiter undo money just taken, but not delete it once Undo's moment has passed", async () => {
    const { accountId, shopId } = await createAccount("U");
    const device = async (roleId) => as((await phoneToken(accountId, (await addMember(accountId, { name: roleId, roleId }))._id)).token);
    const [staff, manager] = [await device("staff"), await device("manager")];
    const payment = (id, over = {}) => ({ table: "payments", record: { id, shopId, orderId: "o1", amount: 22000, method: "cash", receivedAt: 1, ...over } });

    await staff.push([payment("p1"), payment("p2")]).expect(200);
    await staff.push([payment("p1", { deleted: true })]).expect(200); // Undo, seconds later
    // p2 reached the account three minutes ago.
    await SyncRecord.collection.updateOne({ accountId, table: "payments", id: "p2" }, { $set: { updatedAt: new Date(Date.now() - 3 * 60_000) } });
    const refused = await staff.push([payment("p2", { deleted: true })]).expect(403);
    expect(refused.body.current).toMatchObject({ id: "p2", amount: 22000, deleted: false });
    await manager.push([payment("p2", { deleted: true })]).expect(200);
  });

  it("lets no waiter move a bill on a regular's name to another number or shrink it", async () => {
    const { accountId, shopId } = await createAccount("L");
    const device = async (roleId) => as((await phoneToken(accountId, (await addMember(accountId, { name: roleId, roleId }))._id)).token);
    const [staff, manager] = [await device("staff"), await device("manager")];
    const later = (over = {}) => ({ table: "payments", record: { id: "p1", shopId, orderId: "o1", amount: 30000, method: "later", customer: "Sharma ji", phone: "9876543210", ...over } });
    await manager.push([later()]).expect(200);
    await staff.push([later({ phone: "9123456780" })]).expect(403);
    await staff.push([later({ amount: 100 })]).expect(403);
    await staff.push([later({ orderId: "o2" })]).expect(200);
  });

  it("answers a refused new record with nothing held", async () => {
    const { accountId, shopId } = await createAccount("N");
    const staff = as((await phoneToken(accountId, (await addMember(accountId, { name: "Ravi", roleId: "staff" }))._id)).token);
    const reply = await staff.push([{ table: "payments", record: { id: "p9", shopId, method: "later", customer: "A", phone: "9876543210", amount: 100 } }]).expect(403);
    expect(reply.body.current).toBeNull();
  });

  it("lets a manager over all shops edit the menu", async () => {
    const { device } = await memberDevice("manager");
    await device.push([item("i1")]).expect(200);
  });
});
