import Brand from "../models/Brand.js";
import Shop from "../models/Shop.js";
import SyncRecord from "../models/SyncRecord.js";
import Account from "../models/Account.js";
import { fileMenusUnderBrands } from "../migrations/brands.js";
import { connect, closeDatabase, clearDatabase } from "./helpers/db.js";
import { createAccount } from "./helpers/tenancy.js";

beforeAll(connect);
afterEach(clearDatabase);
afterAll(closeDatabase);

/** An account as the live API stored it before brands: no brand anywhere. */
async function accountFromBeforeBrands(name) {
  const accountId = `old-${name}`;
  await Account.create({ _id: accountId, name, seq: 3 });
  await Shop.collection.insertOne({ _id: `shop-${name}`, accountId, name });
  await SyncRecord.collection.insertMany([
    { accountId, table: "items", id: "i1", deleted: false, data: { name: "Samosa" }, seq: 1 },
    { accountId, table: "categories", id: "c1", deleted: false, data: { name: "Starters" }, seq: 2 },
    { accountId, table: "orders", id: "o1", shopId: `shop-${name}`, deleted: false, data: {}, seq: 3 },
  ]);
  return accountId;
}

describe("filing menus under brands (step 10a)", () => {
  it("gives an account from before brands its first brand, with its shops and menu in it", async () => {
    const a = await accountFromBeforeBrands("A");
    const b = await accountFromBeforeBrands("B");
    await fileMenusUnderBrands();

    for (const accountId of [a, b]) {
      expect(await Brand.findOne({ accountId, _id: accountId }).lean()).toMatchObject({ name: accountId.slice(4) });
      expect(await Shop.findOne({ accountId }).lean()).toMatchObject({ brandId: accountId });
      const rows = await SyncRecord.find({ accountId }).sort({ seq: 1 }).lean();
      expect(rows.map((r) => [r.id, r.brandId, r.seq])).toEqual([["i1", accountId, 1], ["c1", accountId, 2], ["o1", undefined, 3]]);
    }
  });

  it("changes nothing the second time, or for an account made with brands", async () => {
    const fresh = await createAccount("New");
    await Brand.updateOne({ accountId: fresh.accountId, _id: fresh.brandId }, { name: "Renamed" });
    await accountFromBeforeBrands("A");
    await fileMenusUnderBrands();
    const before = await SyncRecord.find({ accountId: "old-A" }).lean();

    await fileMenusUnderBrands();
    expect(await SyncRecord.find({ accountId: "old-A" }).lean()).toEqual(before);
    expect(await Brand.countDocuments({ accountId: "old-A" })).toBe(1);
    expect(await Brand.countDocuments({ accountId: fresh.accountId })).toBe(1);
    expect((await Brand.findOne({ accountId: fresh.accountId }).lean()).name).toBe("Renamed");
  });
});
