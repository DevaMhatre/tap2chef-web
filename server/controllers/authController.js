import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import Account from "../models/Account.js";
import LoginCode from "../models/LoginCode.js";
import Member from "../models/Member.js";
import Shop from "../models/Shop.js";
import User from "../models/User.js";
import { mailer } from "../lib/mailer.js";

export const CODE_LIFETIME_MS = 10 * 60 * 1000;
export const RESEND_AFTER_MS = 30 * 1000;
export const MAX_ATTEMPTS = 5;
const DEVICE_TOKEN_LIFETIME = "365d";

const hashCode = (email, code) =>
  crypto.createHmac("sha256", process.env.JWT_SECRET).update(`${email}:${code}`).digest("hex");

const sameHash = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

const refuse = (res, status, reason, message, extra = {}) =>
  res.status(status).json({ success: false, reason, message, ...extra });

export const deviceToken = (accountId, memberId) =>
  jwt.sign({ kind: "device", accountId, memberId }, process.env.JWT_SECRET, { expiresIn: DEVICE_TOKEN_LIFETIME });

export async function requestCode(req, res) {
  const { email } = req.body;
  const now = Date.now();

  const live = await LoginCode.findOne({ email }).lean();
  if (live && now - live.sentAt.getTime() < RESEND_AFTER_MS) {
    const retryIn = Math.ceil((RESEND_AFTER_MS - (now - live.sentAt.getTime())) / 1000);
    return refuse(res, 429, "tooSoon", `Wait ${retryIn} seconds to send another code`, { retryIn });
  }

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  await LoginCode.findOneAndReplace(
    { email },
    { email, codeHash: hashCode(email, code), sentAt: new Date(now), expiresAt: new Date(now + CODE_LIFETIME_MS), attempts: 0 },
    { upsert: true },
  );
  try {
    await mailer.sendLoginCode(email, code);
  } catch (error) {
    // Not sent, so not live: asking again mustn't wait for a code that never came.
    await LoginCode.deleteOne({ email });
    console.error(error);
    return refuse(res, 502, "notSent", "Couldn't send the code. Try again.");
  }
  res.json({ success: true, data: { resendIn: RESEND_AFTER_MS / 1000 } });
}

/** The account to file a new sign-up under: the device's own ids, unless they are already taken. */
async function newAccountIds(device) {
  const taken = await Account.exists({ _id: device.accountId });
  return taken ? { accountId: crypto.randomUUID(), shopId: crypto.randomUUID() } : device;
}

async function signUp(email, device, restaurantName) {
  const { accountId, shopId } = await newAccountIds(device);
  const memberId = crypto.randomUUID();
  await Account.create({ _id: accountId, name: restaurantName });
  await Shop.create({ _id: shopId, accountId, name: restaurantName });
  await Member.create({ _id: memberId, accountId, name: "Owner", roleId: "owner", scope: { kind: "allShops" } });
  await User.updateOne({ email }, { $push: { memberships: { accountId, memberId } } }, { upsert: true });
  return { accountId, shopId, memberId, restaurantName };
}

/** An existing owner: their first account, and the first shop they work in. */
async function signIn({ accountId, memberId }) {
  const member = await Member.findOne({ accountId, _id: memberId }).lean();
  if (!member || member.removedAt != null) return undefined;
  const scope = member.scope.kind === "shop" ? { _id: member.scope.shopId } : {};
  const [account, shop] = await Promise.all([
    Account.findById(accountId).lean(),
    Shop.findOne({ accountId, ...scope }).sort({ createdAt: 1 }).lean(),
  ]);
  if (!account || !shop) return undefined;
  return { accountId, shopId: shop._id, memberId, restaurantName: account.name };
}

export async function verifyCode(req, res) {
  const { email, code, device, restaurantName } = req.body;

  // Counting the try and reading the code are one step, so guesses sent all
  // at once still count one by one.
  const live = await LoginCode.findOneAndUpdate(
    { email, expiresAt: { $gt: new Date() }, attempts: { $lt: MAX_ATTEMPTS } },
    { $inc: { attempts: 1 } },
    { returnDocument: "after" },
  ).lean();
  if (!live) {
    const spent = await LoginCode.exists({ email, expiresAt: { $gt: new Date() } });
    return spent
      ? refuse(res, 400, "tooManyTries", "Too many tries. Send a new code.")
      : refuse(res, 400, "expired", "That code has expired. Send a new one.");
  }
  if (!sameHash(live.codeHash, hashCode(email, code))) return refuse(res, 400, "wrongCode", "That code isn't right.");

  const user = await User.findOne({ email }).lean();
  const membership = user?.memberships[0];
  // A new owner names the restaurant first; the code stays good until then.
  if (!membership && !restaurantName) return res.json({ success: true, data: { needsName: true } });

  // A code is used once: of two taps on Sign in, only the one that takes it goes on.
  const { deletedCount } = await LoginCode.deleteOne({ _id: live._id });
  if (deletedCount === 0) return refuse(res, 400, "expired", "That code was just used. Send a new one.");

  const session = membership ? await signIn(membership) : await signUp(email, device, restaurantName);
  if (!session) return refuse(res, 403, "noAccess", "This email no longer has access to a restaurant.");

  res.json({
    success: true,
    data: {
      token: deviceToken(session.accountId, session.memberId),
      accountId: session.accountId,
      shopId: session.shopId,
      restaurantName: session.restaurantName,
      email,
    },
  });
}
