import type { Paise } from "../domain/money";

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

export const formatINR = (amount: Paise): string => inr.format(amount / 100);

const inrWhole = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

// Menu prices: ₹220, but ₹220.50 when there are paise.
export const formatPrice = (amount: Paise): string =>
  amount % 100 === 0 ? inrWhole.format(amount / 100) : formatINR(amount);
