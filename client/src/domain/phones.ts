// The phones (and tablets, computers) signed in to a restaurant, as the
// owner's phone lists them.

export type Phone = {
  id: string;
  /** "Android phone", "iPhone": what kind of device. */
  label: string;
  /** Who it was added for ("Ravi"); missing on the owner's phone and on one linked before people existed. */
  person?: string;
  /** Signed in with the owner's email, or joined with a code. */
  kind: "owner" | "linked";
  lastSeenAt: number;
  /** The phone looking at the list. */
  current: boolean;
};

/** What a device is, from what its browser says: the name it gets in the owner's list. */
export function phoneLabel(userAgent: string): string {
  if (/iPad/.test(userAgent)) return "iPad";
  if (/iPhone/.test(userAgent)) return "iPhone";
  if (/Android/.test(userAgent)) return /Mobile/.test(userAgent) ? "Android phone" : "Android tablet";
  if (/Macintosh/.test(userAgent)) return "Mac";
  if (/Windows/.test(userAgent)) return "Windows computer";
  if (/CrOS/.test(userAgent)) return "Chromebook";
  return "Phone";
}

/** The owner's phone first, then by when they joined (the server's order). */
export const ownerFirst = (phones: readonly Phone[]): Phone[] => [...phones].sort((a, b) => Number(b.current) - Number(a.current));

/** The code's 6 digits, from a link's "#123456" or anything typed. */
export const JOIN_CODE_LENGTH = 6;
