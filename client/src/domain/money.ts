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
