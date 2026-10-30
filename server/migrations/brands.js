import Account from "../models/Account.js";
import Brand from "../models/Brand.js";
import Shop from "../models/Shop.js";
import SyncRecord from "../models/SyncRecord.js";
import { BRAND_TABLES } from "../domain/tables.js";

/**
 * Step 10a: the menu moved from the account to a brand. An account from before
 * gets its first brand, with the account's id as its devices name it; its
 * shops join that brand and its menu records are filed under it. Runs at
 * every start, before the API listens; once done, it changes nothing.
 */
export async function fileMenusUnderBrands() {
  const accounts = await Account.find({}, { name: 1 }).lean();
  if (accounts.length > 0) {
    await Brand.bulkWrite(
      accounts.map(({ _id, name }) => ({
        updateOne: { filter: { accountId: _id, _id }, update: { $setOnInsert: { name } }, upsert: true },
      })),
    );
  }
  // Every account at once, so past the tenancy gate on purpose: each row
  // takes its own account's id, never another's.
  const fromAccount = [{ $set: { brandId: "$accountId" } }];
  await Shop.collection.updateMany({ brandId: { $exists: false } }, fromAccount);
  await SyncRecord.collection.updateMany({ table: { $in: BRAND_TABLES }, brandId: { $exists: false } }, fromAccount);
}
