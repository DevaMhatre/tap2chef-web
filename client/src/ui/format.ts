import type { Paise } from "../domain/money";

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

export const formatINR = (amount: Paise): string => inr.format(amount / 100);
