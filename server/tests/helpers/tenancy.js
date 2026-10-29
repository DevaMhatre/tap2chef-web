import jwt from "jsonwebtoken";
import Account from "../../models/Account.js";
import Member from "../../models/Member.js";
import Shop from "../../models/Shop.js";

/** An account with one shop and its owner, as sign-up will make them. */
export async function createAccount(name = "Sharma Dhaba") {
  const accountId = `acc-${name}`;
  const shopId = `shop-${name}`;
  await Account.create({ _id: accountId, name });
  await Shop.create({ _id: shopId, accountId, name });
  const owner = await addMember(accountId, { name: "Owner", roleId: "owner" });
  return { accountId, shopId, owner };
}

export async function addShop(accountId, name) {
  return Shop.create({ _id: `shop-${name}`, accountId, name });
}

let n = 0;
export async function addMember(accountId, { name, roleId, scope = { kind: "allShops" } }) {
  n += 1;
  return Member.create({ _id: `m${n}`, accountId, name, roleId, scope });
}

export const deviceToken = (accountId, memberId) =>
  jwt.sign({ kind: "device", accountId, memberId }, process.env.JWT_SECRET, { expiresIn: "1h" });
