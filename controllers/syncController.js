import Account from "../models/Account.js";
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
 * The account's catalog changes every shop, so only someone who works in all
 * of them may write it; a shop record needs the permission in that shop.
 */
function mayWrite(member, table, shopId) {
  const permission = WRITE_PERMISSION[table];
  if (!isShopTable(table)) return member.scope.kind === "allShops" && can(member, permission, undefined);
  return can(member, permission, shopId);
}

const fail = (res, status, message) => res.status(status).json({ success: false, message });

export async function push(req, res) {
  const { accountId, member } = req.device;
  const { changes } = req.body;

  // Every change is checked before any is written: a refused batch leaves nothing behind.
  const shopIds = new Set();
  for (const { table, record } of changes) {
    if (isShopTable(table) !== (record.shopId !== undefined)) {
      return fail(res, 400, isShopTable(table) ? `A ${table} record needs its shop` : `A ${table} record belongs to no shop`);
    }
    if (!mayWrite(member, table, record.shopId)) return fail(res, 403, `Not allowed to change ${table}`);
    if (record.shopId) shopIds.add(record.shopId);
  }
  const known = await Shop.countDocuments({ accountId, _id: { $in: [...shopIds] } });
  if (known !== shopIds.size) return fail(res, 404, "Unknown shop");

  // A record never changes shop, so another shop's record can't be taken
  // over by sending its id.
  const shopRecords = changes.filter(({ table }) => isShopTable(table));
  const stored = await SyncRecord.find(
    { accountId, id: { $in: shopRecords.map(({ record }) => record.id) } },
    { table: 1, id: 1, shopId: 1 },
  ).lean();
  const storedShop = new Map(stored.map((row) => [`${row.table}/${row.id}`, row.shopId]));
  const moved = shopRecords.some(({ table, record }) => {
    const shopId = storedShop.get(`${table}/${record.id}`);
    return shopId !== undefined && shopId !== record.shopId;
  });
  if (moved) return fail(res, 409, "A record can't move to another shop");

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
        const { id, shopId, deleted, accountId: _claimed, ...data } = record;
        next += 1;
        return {
          updateOne: {
            filter: { accountId, table, id },
            update: { $set: { ...(shopId ? { shopId } : {}), deleted: deleted ?? false, data, seq: next } },
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
  if (!(await Shop.exists({ accountId, _id: shopId }))) return fail(res, 404, "Unknown shop");

  const rows = await SyncRecord.find({
    accountId,
    seq: { $gt: since },
    $or: [{ shopId: { $exists: false } }, { shopId }],
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
        record: { ...row.data, id: row.id, ...(row.shopId ? { shopId: row.shopId } : {}), deleted: row.deleted },
      })),
      // Where to pull from next. Other shops' changes in between are skipped
      // on the next pull, not counted here.
      seq: page.at(-1)?.seq ?? since,
      more: rows.length > PULL_LIMIT,
    },
  });
}
