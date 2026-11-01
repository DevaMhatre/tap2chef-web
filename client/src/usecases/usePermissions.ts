import { useCallback } from "react";
import { phoneCan, type Permission, type PhonePerson } from "../domain/access";
import type { DeviceSession } from "../domain/signIn";
import { useDeviceSession } from "./useSignIn";

/** Who this phone works as: undefined for the owner's own phone (or one working alone). */
export function phonePerson(session: DeviceSession | null | undefined): PhonePerson | undefined {
  return session?.via === "link" ? session.person : undefined;
}

/**
 * What this phone may do. Screens ask it before showing a control, so a
 * waiter never meets a button that would be refused. The server enforces the
 * same for what it can see; discounts it can't yet, so hiding them is the guard.
 */
export function useCan(): (permission: Permission) => boolean {
  const session = useDeviceSession();
  const person = phonePerson(session);
  return useCallback((permission: Permission) => phoneCan(person, permission), [person]);
}
