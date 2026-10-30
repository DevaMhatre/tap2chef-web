import jwt from "jsonwebtoken";
import Account from "../../models/Account.js";
import Brand from "../../models/Brand.js";
import Member from "../../models/Member.js";
import Shop from "../../models/Shop.js";
import { signInDevice } from "../../lib/deviceTokens.js";

/** An account with one brand, one shop and its owner, as sign-up makes them. */
export async function createAccount(name = "Sharma Dhaba") {
  const accountId = `acc-${name}`;
  const brandId = accountId;
  const shopId = `shop-${name}`;
  await Account.create({ _id: accountId, name });
  await Brand.create({ _id: brandId, accountId, name });
  await Shop.create({ _id: shopId, accountId, brandId, name });
  const owner = await addMember(accountId, { name: "Owner", roleId: "owner" });
  return { accountId, brandId, shopId, owner };
}

/** Another shop; of the account's first brand unless another is named. */
export async function addShop(accountId, name, brandId = accountId) {
  return Shop.create({ _id: `shop-${name}`, accountId, brandId, name });
}

export async function addBrand(accountId, name) {
  return Brand.create({ _id: `brand-${name}`, accountId, name });
}

let n = 0;
export async function addMember(accountId, { name, roleId, scope = { kind: "allShops" } }) {
  n += 1;
  return Member.create({ _id: `m${n}`, accountId, name, roleId, scope });
}

/** A token as phones had before they had records of their own (no device in it). */
export const legacyToken = (accountId, memberId) =>
  jwt.sign({ kind: "device", accountId, memberId }, process.env.JWT_SECRET, { expiresIn: "1h" });

/** A phone of the account's first shop (or `shopId`), signed in as `memberId`, and its token. */
export async function phoneToken(accountId, memberId, { kind = "owner", shopId, label = "Android phone" } = {}) {
  const shop = shopId ?? (await Shop.findOne({ accountId }).sort({ createdAt: 1 }).lean())._id;
  const { device, token } = await signInDevice({ accountId, shopId: shop, memberId, kind, label });
  return { token, deviceId: device._id };
}
