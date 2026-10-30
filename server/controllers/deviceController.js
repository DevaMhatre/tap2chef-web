import crypto from "node:crypto";
import Account from "../models/Account.js";
import Device from "../models/Device.js";
import LinkCode from "../models/LinkCode.js";
import Shop from "../models/Shop.js";
import SyncRecord from "../models/SyncRecord.js";
import { can } from "../domain/access.js";
import { signInDevice } from "../lib/deviceTokens.js";

export const LINK_CODE_LIFETIME_MS = 10 * 60 * 1000;

const hashCode = (code) => crypto.createHmac("sha256", process.env.JWT_SECRET).update(`link:${code}`).digest("hex");
const fail = (res, status, reason, message) => res.status(status).json({ success: false, reason, message });

/** Only the owner's own phone (signed in by email) manages phones, and only in its shop. */
function mayManagePhones({ device, member }) {
  return device.kind === "owner" && can(member, "devices.manage", device.shopId);
}

/** The restaurant's name as its owner last gave it: the setup's record, else the shop's own. */
async function restaurantName(accountId, shopId) {
  const details = await SyncRecord.findOne({ accountId, table: "shopDetails", id: shopId, deleted: false }).lean();
  if (typeof details?.data?.name === "string") return details.data.name;
  const [shop, account] = await Promise.all([Shop.findOne({ accountId, _id: shopId }).lean(), Account.findById(accountId).lean()]);
  return account?.name ?? shop?.name ?? "";
}

/** A fresh 6-digit code for this shop, replacing any other: one live code at a time. */
export async function createLinkCode(req, res) {
  if (!mayManagePhones(req.device)) return fail(res, 403, "notOwnerPhone", "Only the owner's phone can add phones");
  const { accountId, member, device } = req.device;
  const expiresAt = new Date(Date.now() + LINK_CODE_LIFETIME_MS);
  // Another restaurant's live code may already hold these digits: draw again.
  for (let tries = 0; tries < 5; tries++) {
    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
    try {
      await LinkCode.findOneAndReplace(
        { shopId: device.shopId },
        { codeHash: hashCode(code), accountId, shopId: device.shopId, memberId: member._id, expiresAt },
        { upsert: true },
      );
      return res.json({ success: true, data: { code, expiresAt: expiresAt.getTime() } });
    } catch (error) {
      if (error?.code !== 11000) throw error;
    }
  }
  return fail(res, 503, "busy", "Couldn't make a code. Try again.");
}

/** The phones of this shop, the asking phone marked. */
export async function listDevices(req, res) {
  if (!mayManagePhones(req.device)) return fail(res, 403, "notOwnerPhone", "Only the owner's phone sees the phones");
  const { accountId, device: here } = req.device;
  const devices = await Device.find({ accountId, shopId: here.shopId, removedAt: { $exists: false } }).sort({ createdAt: 1 }).lean();
  res.json({
    success: true,
    data: {
      devices: devices.map((d) => ({
        id: d._id,
        label: d.label,
        kind: d.kind,
        lastSeenAt: new Date(d.lastSeenAt).getTime(),
        current: d._id === here._id,
      })),
    },
  });
}

/** Signs a phone out of the restaurant for good; it clears itself the next time it asks. */
export async function removeDevice(req, res) {
  if (!mayManagePhones(req.device)) return fail(res, 403, "notOwnerPhone", "Only the owner's phone removes phones");
  const { accountId, device: here } = req.device;
  if (req.params.id === here._id) return fail(res, 409, "thisPhone", "This phone can't remove itself");
  const { matchedCount } = await Device.updateOne(
    { accountId, _id: req.params.id, shopId: here.shopId, removedAt: { $exists: false } },
    { removedAt: new Date() },
  );
  if (matchedCount === 0) return fail(res, 404, "unknown", "No such phone");
  res.json({ success: true, data: {} });
}

/**
 * A new phone with a code. Without `confirm` it only learns the restaurant's
 * name ("Join Sharma Dhaba?"); with it, the code is used up and the phone is
 * let in, working with the permissions of the owner who showed the code.
 */
export async function join(req, res) {
  const { code, confirm, label } = req.body;
  const filter = { codeHash: hashCode(code), expiresAt: { $gt: new Date() } };

  if (!confirm) {
    const live = await LinkCode.findOne(filter).lean();
    if (!live) return fail(res, 400, "wrongCode", "That code isn't right, or it has expired");
    return res.json({ success: true, data: { restaurantName: await restaurantName(live.accountId, live.shopId) } });
  }

  // Used once: of two taps on Join, only the one that takes it goes on.
  const live = await LinkCode.findOneAndDelete(filter).lean();
  if (!live) return fail(res, 400, "wrongCode", "That code isn't right, or it has expired");
  const shop = await Shop.findOne({ accountId: live.accountId, _id: live.shopId }).lean();
  if (!shop) return fail(res, 400, "wrongCode", "That restaurant no longer exists");

  const { token } = await signInDevice({ accountId: live.accountId, shopId: shop._id, memberId: live.memberId, kind: "linked", label });
  res.json({
    success: true,
    data: {
      token,
      accountId: live.accountId,
      brandId: shop.brandId,
      shopId: shop._id,
      restaurantName: await restaurantName(live.accountId, shop._id),
    },
  });
}
