import { spentOn, type Expense, type Spending } from "./expense";
import type { ItemId } from "./menu";
import { addPaise, type Paise } from "./money";
import { billOf, counts, isLive, lineTotal, type BusinessDate, type Order, type OrderLine, type Payment } from "./order";
import { takings, type Takings } from "./settlement";

/** A dish and how many went out, for "what sold today". */
export type DishCount = { itemId: ItemId; name: string; quantity: number };

/**
 * One trading day, read from the records. Money signs: `left` and `drawer`
 * are whole paise like everything else, but may be below zero (more went out
 * than came in), so they are plain numbers, not `Paise`.
 */
export type DayNumbers = {
  day: BusinessDate;
  /** Money received against the day's bills, by drawer. */
  sales: Takings;
  spent: Spending;
  /** Sales minus spending. */
  left: number;
  /** What the cash box should hold from today's trading: cash in, cash out. */
  drawer: number;
  /** Bills paid in full. */
  settled: number;
  /** Bills not paid yet: what is still to come, by what the guests owe. */
  unpaid: { count: number; amount: Paise };
  /** Cancelled after the kitchen had them: what they would have come to. */
  cancelled: { dishes: number; value: Paise };
  discounts: { count: number; amount: Paise };
  /** Cash turned UPI or the other way. */
  corrected: number;
  /** A wrong payment taken off; the owner should see what it was. */
  removed: { count: number; amount: Paise };
  top: DishCount[];
};

export const TOP_DISHES = 3;

/**
 * A bill counts on its order's trading day, whenever it was paid: one served
 * on Tuesday evening and paid after 4 am Wednesday is Tuesday's. Pass every
 * order of the day; lines and payments of other orders are ignored.
 */
export function dayNumbers(
  day: BusinessDate,
  orders: readonly Order[],
  lines: readonly OrderLine[],
  payments: readonly Payment[],
  expenses: readonly Expense[],
): DayNumbers {
  const mine = orders.filter((o) => o.businessDate === day);
  const ids = new Set(mine.map((o) => o.id));
  const ownLines = lines.filter((l) => ids.has(l.orderId));
  const ownPayments = payments.filter((p) => ids.has(p.orderId));

  const sales = takings(ownPayments.filter(counts));
  const spent = spentOn(expenses, day);

  const bills = mine.map((order) => ({ order, bill: billOf(order, ownLines, ownPayments) }));
  const owing = bills.filter(({ order, bill }) => order.state.status !== "settled" && (bill.due > 0 || bill.paid > 0) && bill.remaining > 0);
  const withDiscount = bills.flatMap(({ bill }) => (bill.discount ? [bill.discount.amount] : []));
  const voided = ownLines.filter((l) => l.state.status === "voided");
  const gone = ownPayments.filter((p) => p.removedAt !== undefined);

  return {
    day,
    sales,
    spent,
    left: sales.total - spent.total,
    drawer: sales.cash - spent.cash,
    settled: mine.filter((o) => o.state.status === "settled").length,
    // Open orders with no live dish and nothing paid owe nothing: they don't count.
    unpaid: {
      count: owing.length,
      amount: addPaise(...owing.map(({ bill }) => bill.remaining as Paise)),
    },
    cancelled: { dishes: voided.reduce((n, l) => n + l.quantity, 0), value: addPaise(...voided.map(lineTotal)) },
    discounts: { count: withDiscount.length, amount: addPaise(...withDiscount) },
    corrected: ownPayments.filter((p) => p.correctedAt !== undefined && counts(p)).length,
    removed: { count: gone.length, amount: addPaise(...gone.map((p) => p.amount)) },
    top: topDishes(ownLines),
  };
}

// Sent and still standing: a dish in an unsent cart hasn't sold yet.
function topDishes(lines: readonly OrderLine[]): DishCount[] {
  const by = new Map<ItemId, DishCount>();
  for (const line of lines.filter((l) => isLive(l) && l.state.status === "sent")) {
    const known = by.get(line.itemId);
    by.set(line.itemId, { itemId: line.itemId, name: known?.name ?? line.name, quantity: (known?.quantity ?? 0) + line.quantity });
  }
  return [...by.values()].sort((a, b) => b.quantity - a.quantity || (a.name < b.name ? -1 : 1)).slice(0, TOP_DISHES);
}

/** A day with nothing in it: no bill, no expense. The screen says so instead of showing zeros. */
export const isQuiet = (n: DayNumbers): boolean =>
  n.sales.total === 0 && n.spent.total === 0 && n.unpaid.count === 0 && n.cancelled.dishes === 0 && n.removed.count === 0;
