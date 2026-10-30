import Account from "../models/Account.js";
import Brand from "../models/Brand.js";
import Shop from "../models/Shop.js";
import SyncRecord from "../models/SyncRecord.js";
import { can } from "../domain/access.js";
import { isShopTable, WRITE_PERMISSION } from "../domain/tables.js";
import { serialByKey } from "../lib/serialByKey.js";

export const PULL_LIMIT = 500;

// One push at a time per account. Each takes a block of sync numbers and
// writes them in order, so a device pulling "since N" can never pass a number
// that is still to be written.
const perAccount = serialByKey();

/**
 * A brand's catalog changes every shop of the brand, so only someone who works
 * in all shops may write it; a shop record needs the permission in that shop.
 */
function mayWrite(member, table, shopId) {
  const permission = WRITE_PERMISSION[table];
  if (!isShopTable(table)) return member.scope.kind === "allShops" && can(member, permission, undefined);
  return can(member, permission, shopId);
}

const fail = (res, status, message) => res.status(status).json({ success: false, message });

/** A menu record from a device built before brands names none: it is the account's first brand. */
const withBrand = (accountId) => ({ table, record }) =>
  isShopTable(table) || record.brandId !== undefined ? { table, record } : { table, record: { ...record, brandId: accountId } };

/** The shop a shop record belongs to, or the brand a menu record does. */
const ownerOf = (record) => record.shopId ?? record.brandId;

export async function push(req, res) {
  const { accountId, member } = req.device;
  const changes = req.body.changes.map(withBrand(accountId));

  // Every change is checked before any is written: a refused batch leaves nothing behind.
  const shopIds = new Set();
  const brandIds = new Set();
  for (const { table, record } of changes) {
    if (isShopTable(table)) {
      if (record.shopId === undefined) return fail(res, 400, `A ${table} record needs its shop`);
      if (record.brandId !== undefined) return fail(res, 400, `A ${table} record belongs to a shop, not a brand`);
    } else if (record.shopId !== undefined) return fail(res, 400, `A ${table} record belongs to no shop`);
    if (!mayWrite(member, table, record.shopId)) return fail(res, 403, `Not allowed to change ${table}`);
    if (record.shopId) shopIds.add(record.shopId);
    else brandIds.add(record.brandId);
  }
  const [knownShops, knownBrands] = await Promise.all([
    Shop.countDocuments({ accountId, _id: { $in: [...shopIds] } }),
    Brand.countDocuments({ accountId, _id: { $in: [...brandIds] } }),
  ]);
  if (knownShops !== shopIds.size) return fail(res, 404, "Unknown shop");
  if (knownBrands !== brandIds.size) return fail(res, 404, "Unknown brand");

  // A record never changes shop or brand, so another's record can't be taken
  // over by sending its id.
  const stored = await SyncRecord.find(
    { accountId, id: { $in: changes.map(({ record }) => record.id) } },
    { table: 1, id: 1, shopId: 1, brandId: 1 },
  ).lean();
  const storedOwner = new Map(stored.map((row) => [`${row.table}/${row.id}`, ownerOf(row)]));
  const moved = changes.some(({ table, record }) => {
    const owner = storedOwner.get(`${table}/${record.id}`);
    return owner !== undefined && owner !== ownerOf(record);
  });
  if (moved) return fail(res, 409, "A record can't move to another shop or brand");

  const seq = await perAccount(accountId, async () => {
    const account = await Account.findOneAndUpdate(
      { _id: accountId },
      { $inc: { seq: changes.length } },
      { returnDocument: "after" },
    );
    if (!account) return undefined;
    let next = account.seq - changes.length;
    await SyncRecord.bulkWrite(
      changes.map(({ table, record }) => {
        // The token says whose record it is, never the record.
        const { id, brandId, shopId, deleted, accountId: _claimed, ...data } = record;
        next += 1;
        return {
          updateOne: {
            filter: { accountId, table, id },
            update: { $set: { ...(shopId ? { shopId } : { brandId }), deleted: deleted ?? false, data, seq: next } },
            upsert: true,
          },
        };
      }),
    );
    return account.seq;
  });

  if (seq === undefined) return fail(res, 404, "Unknown account");
  res.json({ success: true, data: { seq } });
}

export async function pull(req, res) {
  const { accountId, member } = req.device;
  const { since, shopId } = req.query;

  if (member.scope.kind === "shop" && member.scope.shopId !== shopId) return fail(res, 403, "Not allowed in this shop");
  const shop = await Shop.findOne({ accountId, _id: shopId }, { brandId: 1 }).lean();
  if (!shop) return fail(res, 404, "Unknown shop");

  // The shop's own service, and the menu of its brand.
  const rows = await SyncRecord.find({
    accountId,
    seq: { $gt: since },
    $or: [{ brandId: shop.brandId }, { shopId }],
  })
    .sort({ seq: 1 })
    .limit(PULL_LIMIT + 1)
    .lean();

  const page = rows.slice(0, PULL_LIMIT);
  res.json({
    success: true,
    data: {
      changes: page.map((row) => ({
        table: row.table,
        seq: row.seq,
        record: { ...row.data, id: row.id, ...(row.shopId ? { shopId: row.shopId } : { brandId: row.brandId }), deleted: row.deleted },
      })),
      // Where to pull from next. Other shops' changes in between are skipped
      // on the next pull, not counted here.
      seq: page.at(-1)?.seq ?? since,
      more: rows.length > PULL_LIMIT,
    },
  });
}
