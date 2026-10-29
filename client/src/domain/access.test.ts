import { describe, expect, it } from "vitest";
import { can, PERMISSIONS, PRESET_ROLES, readPin, type Member, type MemberId, type Role, type RoleId, type ShopId } from "./access";

const here = "s1" as ShopId;
const there = "s2" as ShopId;
const member = (roleId: string, over: Partial<Member> = {}): Member => ({
  id: "m1" as MemberId, name: "Ravi", roleId: roleId as RoleId, scope: { kind: "allShops" }, ...over,
});

describe("can", () => {
  it("gives the owner everything, in every shop", () => {
    const owner = member("owner");
    expect(PERMISSIONS.every((p) => can(owner, p, here) && can(owner, p, there))).toBe(true);
  });

  it("lets staff run the service but not take money back, see the day or change the menu", () => {
    const staff = member("staff");
    expect(can(staff, "orders.take", here)).toBe(true);
    expect(can(staff, "payments.take", here)).toBe(true);
    expect(can(staff, "orders.cancelSent", here)).toBe(true);
    expect(can(staff, "payments.remove", here)).toBe(false);
    expect(can(staff, "day.view", here)).toBe(false);
    expect(can(staff, "menu.edit", here)).toBe(false);
  });

  it("keeps people, devices, shops and the plan with the owner", () => {
    const manager = member("manager");
    expect(can(manager, "menu.edit", here)).toBe(true);
    for (const p of ["members.manage", "devices.manage", "shops.manage", "account.manage"] as const) {
      expect(can(manager, p, here)).toBe(false);
    }
  });

  it("limits a one-shop member to that shop", () => {
    const m = member("manager", { scope: { kind: "shop", shopId: here } });
    expect(can(m, "menu.edit", here)).toBe(true);
    expect(can(m, "orders.take", there)).toBe(false);
  });

  it("grants nothing to someone who left, or to a role that doesn't exist", () => {
    expect(can(member("owner", { removedAt: 5 }), "orders.take", here)).toBe(false);
    expect(can(member("ghost"), "orders.take", here)).toBe(false);
  });

  it("reads a custom role as data", () => {
    const roles: Role[] = [...PRESET_ROLES, { id: "cashier" as RoleId, name: "Cashier", permissions: ["payments.take"] }];
    expect(can(member("cashier"), "payments.take", here, roles)).toBe(true);
    expect(can(member("cashier"), "orders.take", here, roles)).toBe(false);
  });

  it("gives every preset only real permissions, each once", () => {
    for (const role of PRESET_ROLES) {
      expect(role.permissions.every((p) => PERMISSIONS.includes(p))).toBe(true);
      expect(new Set(role.permissions).size).toBe(role.permissions.length);
    }
  });
});

describe("readPin", () => {
  it("takes four digits", () => {
    expect(readPin("4071")).toEqual({ ok: true, value: "4071" });
    expect(readPin("0590")).toEqual({ ok: true, value: "0590" });
  });

  it("refuses anything but four digits", () => {
    for (const bad of ["", "123", "12345", "12a4", " 4071", "४०७१"]) expect(readPin(bad)).toEqual({ ok: false, error: "notFourDigits" });
  });

  it("refuses the PINs a colleague would guess first", () => {
    for (const easy of ["0000", "7777", "1234", "6789", "9876", "3210"]) expect(readPin(easy)).toEqual({ ok: false, error: "tooEasy" });
    for (const fine of ["1357", "2468", "1123", "9870"]) expect(readPin(fine).ok).toBe(true);
  });
});
