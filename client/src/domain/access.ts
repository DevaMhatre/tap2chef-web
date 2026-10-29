import type { Id } from "./menu";
import { err, ok, type Result } from "./result";

// Who may do what. An account (the subscriber) runs one or more shops; its
// members work in one shop or all of them, with a role. Code asks `can()`,
// never a role's name, so a custom role later needs no code change.

export type AccountId = Id<"AccountId">;
export type ShopId = Id<"ShopId">;
export type MemberId = Id<"MemberId">;
export type RoleId = Id<"RoleId">;

/** The subscriber. Billing and plan arrive with subscriptions. */
export type Account = { id: AccountId; name: string };

/** One restaurant outlet. A single-shop owner never sees this word. */
export type Shop = { id: ShopId; name: string };

/**
 * Every gate in the product, and nothing that isn't one. Adding a gate adds a
 * name here and to the presets that should have it.
 */
export const PERMISSIONS = [
  /** Open orders, add and send dishes, hand over the bill. */
  "orders.take",
  /** Cash or UPI against a bill. */
  "payments.take",
  /** Cancel a dish the kitchen already has. */
  "orders.cancelSent",
  /** Mark a dish out for today. */
  "stock.markOut",
  /** Note money that went out of the drawer. */
  "expenses.note",
  /** "Make it ₹850". */
  "bills.discount",
  /** Change a payment's method (cash turned UPI). */
  "payments.correct",
  /** Take a wrong payment off a bill. */
  "payments.remove",
  /** Take an expense off. */
  "expenses.remove",
  /** The day's numbers, settled bills and the cash drawer. */
  "day.view",
  "menu.edit",
  "tables.edit",
  "members.manage",
  "devices.manage",
  "shops.manage",
  /** Plan and billing. */
  "account.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export type Role = { id: RoleId; name: string; permissions: readonly Permission[] };

const STAFF: readonly Permission[] = [
  "orders.take",
  "payments.take",
  "orders.cancelSent",
  "stock.markOut",
  "expenses.note",
];

const MANAGER: readonly Permission[] = [
  ...STAFF,
  "bills.discount",
  "payments.correct",
  "payments.remove",
  "expenses.remove",
  "day.view",
  "menu.edit",
  "tables.edit",
];

/**
 * The three bundles every account starts with. Data, not code: staff run the
 * service and every slip they make stays visible; money taken back, the menu
 * and the day's takings need a manager; only the owner manages people,
 * devices, shops and the plan.
 */
export const PRESET_ROLES: readonly Role[] = [
  { id: "owner" as RoleId, name: "Owner", permissions: PERMISSIONS },
  { id: "manager" as RoleId, name: "Manager", permissions: MANAGER },
  { id: "staff" as RoleId, name: "Staff", permissions: STAFF },
];

export type MemberScope = { kind: "allShops" } | { kind: "shop"; shopId: ShopId };

/**
 * A person who works here. Staff have no login of their own; they pick
 * themselves on a shared device with a PIN.
 */
export type Member = {
  id: MemberId;
  name: string;
  roleId: RoleId;
  scope: MemberScope;
  /** Left the restaurant: kept so "cancelled by Ravi" still reads, but can do nothing. */
  removedAt?: number;
};

/** Whether a member may do something in a shop. An unknown role grants nothing. */
export function can(
  member: Member,
  permission: Permission,
  shopId: ShopId,
  roles: readonly Role[] = PRESET_ROLES,
): boolean {
  if (member.removedAt !== undefined) return false;
  if (member.scope.kind === "shop" && member.scope.shopId !== shopId) return false;
  const role = roles.find((r) => r.id === member.roleId);
  return role?.permissions.includes(permission) ?? false;
}

// ---------------------------------------------------------------- PIN

/** Four digits that say who is using a shared device. */
export type Pin = string & { readonly __brand: "Pin" };
export type PinError = "notFourDigits" | "tooEasy";

/**
 * A PIN names who did something ("cancelled by Ravi"), so one a colleague
 * would guess first (1111, 1234, 9876) is refused.
 */
export function readPin(text: string): Result<Pin, PinError> {
  if (!/^\d{4}$/.test(text)) return err("notFourDigits");
  const steps = [1, 2, 3].map((i) => Number(text[i]) - Number(text[i - 1]));
  if (steps.every((s) => s === steps[0]) && Math.abs(steps[0]!) <= 1) return err("tooEasy");
  return ok(text as Pin);
}
