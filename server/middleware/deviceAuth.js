import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import Device from "../models/Device.js";
import Member from "../models/Member.js";
import Shop from "../models/Shop.js";
import { deviceToken } from "../lib/deviceTokens.js";

const SEEN_EVERY_MS = 60 * 1000;

/**
 * A phone signed in before phones had records of their own (its token names
 * no device): it gets one now, as the owner's phone it was, and a fresh token
 * that names it. The id comes from the token, so asking twice makes one.
 */
async function adoptLegacyDevice(rawToken, accountId, member, userAgent) {
  const id = `legacy-${crypto.createHash("sha256").update(rawToken).digest("hex").slice(0, 32)}`;
  const scope = member.scope.kind === "shop" ? { _id: member.scope.shopId } : {};
  const shop = await Shop.findOne({ accountId, ...scope }).sort({ createdAt: 1 }).lean();
  if (!shop) return undefined;
  const label = /iPhone/.test(userAgent ?? "") ? "iPhone" : /Android/.test(userAgent ?? "") ? "Android phone" : "Phone";
  const device = await Device.findOneAndUpdate(
    { accountId, _id: id },
    { $setOnInsert: { shopId: shop._id, memberId: member._id, kind: "owner", label, lastSeenAt: new Date() } },
    { upsert: true, returnDocument: "after" },
  ).lean();
  return { device, token: deviceToken(accountId, member._id, id) };
}

// A signed-in device: its token names the account, the member who signed it
// in (the owner, or whoever linked it) and the device itself. Who is holding
// the device right now is a PIN on the device; the server only knows whose
// device it is, and whether it was removed.
const deviceAuth = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, message: "No token provided" });
  }

  const raw = header.slice("Bearer ".length);
  let claims;
  try {
    claims = jwt.verify(raw, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ success: false, message: "Invalid or expired token" });
  }
  if (claims.kind !== "device" || typeof claims.accountId !== "string" || typeof claims.memberId !== "string") {
    return res.status(401).json({ success: false, message: "Not a device token" });
  }

  // A removed phone hears "removed" (and clears itself) before anything
  // else: removing it also retires its person, which alone would only sign it out.
  if (typeof claims.deviceId === "string") {
    const removed = await Device.exists({ accountId: claims.accountId, _id: claims.deviceId, removedAt: { $exists: true } });
    if (removed) return res.status(401).json({ success: false, reason: "removed", message: "This phone was removed from the restaurant" });
  }

  const member = await Member.findOne({ accountId: claims.accountId, _id: claims.memberId }).lean();
  if (!member || member.removedAt != null) {
    return res.status(401).json({ success: false, message: "This device is no longer signed in" });
  }

  let device;
  let renewedToken;
  if (typeof claims.deviceId === "string") {
    device = await Device.findOne({ accountId: claims.accountId, _id: claims.deviceId }).lean();
    if (!device || device.removedAt != null) {
      // The phone clears the restaurant from itself on this reason.
      return res.status(401).json({ success: false, reason: "removed", message: "This phone was removed from the restaurant" });
    }
    const now = Date.now();
    if (now - new Date(device.lastSeenAt).getTime() > SEEN_EVERY_MS) {
      await Device.updateOne({ accountId: claims.accountId, _id: device._id }, { lastSeenAt: new Date(now) });
    }
  } else {
    const adopted = await adoptLegacyDevice(raw, claims.accountId, member, req.headers["user-agent"]);
    if (!adopted) return res.status(401).json({ success: false, message: "This device is no longer signed in" });
    ({ device, token: renewedToken } = adopted);
    if (device.removedAt != null) {
      return res.status(401).json({ success: false, reason: "removed", message: "This phone was removed from the restaurant" });
    }
  }

  req.device = { accountId: claims.accountId, member, device, renewedToken };
  next();
};

export default deviceAuth;
