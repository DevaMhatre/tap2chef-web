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

const clock = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit" });

/** When a round went to the kitchen: "1:05 pm". */
export const formatTime = (at: number): string => clock.format(at);

/** How long a table has waited since its last round: "Just now", "12 min", "1 h 5 min". */
export function formatWaited(since: number, now: number): string {
  const minutes = Math.max(0, Math.floor((now - since) / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min`;
  const rest = minutes % 60;
  return rest === 0 ? `${Math.floor(minutes / 60)} h` : `${Math.floor(minutes / 60)} h ${rest} min`;
}

export function formatSentAgo(since: number, now: number): string {
  const waited = formatWaited(since, now);
  return waited === "Just now" ? "sent just now" : `sent ${waited} ago`;
}
