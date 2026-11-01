// Who may do what: the server's copy of client/src/domain/access.ts. Kept
// equal to it by tests/contract.test.js until a shared package exists.

export const PERMISSIONS = [
  "orders.take",
  "payments.take",
  "orders.cancelSent",
  "stock.markOut",
  "expenses.note",
  "bills.discount",
  "payments.later",
  "payments.correct",
  "payments.remove",
  "expenses.remove",
  "day.view",
  "menu.edit",
  "tables.edit",
  "members.manage",
  "devices.manage",
  "shops.manage",
  "account.manage",
];

const STAFF = ["orders.take", "payments.take", "orders.cancelSent", "stock.markOut", "expenses.note"];

// No discounts: at the first restaurant only the owner gives one (2026-10-30).
// Pay later is a manager's call: the owner isn't free to do it all (2026-11-01).
const MANAGER = [
  ...STAFF,
  "payments.later",
  "payments.correct",
  "payments.remove",
  "expenses.remove",
  "day.view",
  "menu.edit",
  "tables.edit",
];

export const PRESET_ROLES = [
  { id: "owner", name: "Owner", permissions: PERMISSIONS },
  { id: "manager", name: "Manager", permissions: MANAGER },
  { id: "staff", name: "Staff", permissions: STAFF },
];

/**
 * What only a phone signed in with the owner's own email may do: a phone
 * linked by a code works, but never manages phones, people, the restaurant or
 * the plan, whoever linked it.
 */
export const OWNER_PHONE_ONLY = ["devices.manage", "members.manage", "shops.manage", "account.manage"];

/** Whether a member may do something in a shop. An unknown role grants nothing. */
export function can(member, permission, shopId, roles = PRESET_ROLES) {
  if (member.removedAt != null) return false;
  if (member.scope.kind === "shop" && member.scope.shopId !== shopId) return false;
  const role = roles.find((r) => r.id === member.roleId);
  return role?.permissions.includes(permission) ?? false;
}
