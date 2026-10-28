// Money is always whole paise. Floats drift (0.1 + 0.2), and a bill that is
// off by a paisa can never settle exactly.
export type Paise = number & { readonly __brand: "Paise" };

export function paise(amount: number): Paise {
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new Error(`Invalid paise amount: ${amount}`);
  }
  return amount as Paise;
}

export function fromRupees(rupees: number): Paise {
  return paise(Math.round(rupees * 100));
}

export function addPaise(...amounts: Paise[]): Paise {
  return paise(amounts.reduce((sum, a) => sum + a, 0));
}

export function multiplyPaise(amount: Paise, quantity: number): Paise {
  return paise(amount * quantity);
}

// What an owner types into a price field: "120", "120.5", "₹1,200". Strict on
// purpose: "12.505" or "12abc" is a typo to show, not something to round away.
export function parseRupees(text: string): Paise | undefined {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text.replace(/[₹,\s]/g, ""));
  if (!match) return undefined;

  const amount = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return Number.isSafeInteger(amount) ? paise(amount) : undefined;
}

// The inverse, for pre-filling an edit field: 12050 → "120.50", 12000 → "120".
export function toRupeeText(amount: Paise): string {
  const whole = Math.floor(amount / 100);
  const fraction = amount % 100;
  return fraction === 0 ? `${whole}` : `${whole}.${String(fraction).padStart(2, "0")}`;
}
