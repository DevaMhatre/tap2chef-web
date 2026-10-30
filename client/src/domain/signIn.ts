import { normalizeName } from "./menu";
import { err, ok, type Result } from "./result";

// The owner signs a device in with their email and a code sent to it. No
// password: nothing to forget, nothing to type mid-service.

export type Email = string & { readonly __brand: "Email" };

/**
 * How this device is signed in: the owner's own phone, by their email, or a
 * phone linked with a code shown on the owner's phone. Only the owner's own
 * phone manages phones and the restaurant.
 */
export type DeviceSession =
  | { via: "email"; email: Email; restaurantName: string }
  | { via: "link"; restaurantName: string };

export const isOwnerPhone = (session: DeviceSession | null | undefined): boolean => session?.via === "email";

/** Loose on purpose: the code that arrives is the real check. */
export function readEmail(text: string): Result<Email, "badEmail"> {
  const email = text.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? ok(email as Email) : err("badEmail");
}

export const CODE_LENGTH = 6;

/** The digits of what was typed or pasted ("123 456" from an email), at most six. */
export const codeDigits = (text: string): string => text.replace(/\D/g, "").slice(0, CODE_LENGTH);

export const RESTAURANT_NAME_MAX = 60;

export function readRestaurantName(text: string): Result<string, "empty" | "tooLong"> {
  const name = normalizeName(text);
  if (name === "") return err("empty");
  if (name.length > RESTAURANT_NAME_MAX) return err("tooLong");
  return ok(name);
}
