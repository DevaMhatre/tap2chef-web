import { normalizeName, unitPrice, type Diet, type Id, type ItemId, type MenuProfile, type OrderableItem, type ProfileId } from "./menu";
import { addPaise, multiplyPaise, type Paise } from "./money";
import { sortByOrder } from "./ordering";
import { err, ok, type Result } from "./result";
import { amountDue, amountPaid, type Discount, type Tender } from "./settlement";
import type { DiningTable, TableId } from "./tables";

export type OrderId = Id<"OrderId">;
export type LineId = Id<"LineId">;
/** One tap of Send: the lines that went to the kitchen together. */
export type RoundId = Id<"RoundId">;
export type PaymentId = Id<"PaymentId">;

// ---------------------------------------------------------------- business date

/** The trading day an order belongs to, "2026-10-29". */
export type BusinessDate = string & { readonly __brand: "BusinessDate" };

// A dinner that runs past midnight still belongs to the evening it started.
export const DAY_STARTS_AT_HOUR = 4;

const pad = (n: number) => `${n}`.padStart(2, "0");
const toBusinessDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` as BusinessDate;

export function businessDate(at: number, dayStartsAt: number = DAY_STARTS_AT_HOUR): BusinessDate {
  const date = new Date(at);
  if (date.getHours() < dayStartsAt) date.setDate(date.getDate() - 1);
  return toBusinessDate(date);
}

export function dayBefore(day: BusinessDate): BusinessDate {
  const [year, month, date] = day.split("-").map(Number) as [number, number, number];
  return toBusinessDate(new Date(year, month - 1, date - 1));
}

// ---------------------------------------------------------------- orders

export type OrderChannel = { type: "dineIn"; tableId: TableId } | { type: "takeaway"; token: number };
export type ChannelType = OrderChannel["type"];

export type OrderState =
  | { status: "open" }
  // The guest asked for the bill and has it; the money is on its way, maybe
  // in parts. One more dish takes the table back to open.
  | { status: "billed"; billedAt: number; discount?: Discount }
  // Final: a settled bill never reopens. `subtotal` is what the dishes came
  // to when it closed, so the day's numbers never re-add lines.
  | { status: "settled"; billedAt: number; settledAt: number; subtotal: Paise; discount?: Discount };

/**
 * Money received against an order: a record of its own, like a line, so two
 * devices taking parts of one bill both count instead of overwriting each other.
 */
export type Payment = {
  id: PaymentId;
  orderId: OrderId;
  amount: Paise;
  receivedAt: number;
  /** When its method was put right ("it was UPI, not cash"); it stays visible. */
  correctedAt?: number;
} & Tender;

export type Order = {
  id: OrderId;
  channel: OrderChannel;
  /** The price list every line of this order is priced from. */
  profileId: ProfileId;
  businessDate: BusinessDate;
  openedAt: number;
  state: OrderState;
};

// Lines are records of their own, not an array on the order, so two devices
// adding to the same table merge instead of overwriting each other.
export type LineState =
  | { status: "draft" }
  | { status: "sent"; roundId: RoundId; sentAt: number }
  // Only a sent line is voided; a draft line is simply removed. A void is
  // kept for good so the day's numbers can show it.
  | { status: "voided"; roundId: RoundId; sentAt: number; voidedAt: number; reason?: VoidReason };

export type VoidReason = "wrongEntry" | "guestChangedMind" | "outOfStock";

export type OrderLine = {
  id: LineId;
  orderId: OrderId;
  itemId: ItemId;
  /** Snapshot when added: a menu edit mid-meal never changes the cart. */
  name: string;
  diet: Diet;
  unitPrice: Paise;
  quantity: number;
  /** "Less spicy". Empty when there is none. */
  note: string;
  addedAt: number;
  state: LineState;
};

export const QUANTITY_MAX = 99;
export const NOTE_MAX = 80;

export const isLive = (line: OrderLine): boolean => line.state.status !== "voided";
export const lineTotal = (line: OrderLine): Paise => multiplyPaise(line.unitPrice, line.quantity);

/** What the table owes: everything ordered and not cancelled, sent or not. */
export function orderTotal(lines: readonly OrderLine[]): Paise {
  return addPaise(...lines.filter(isLive).map(lineTotal));
}

/** How many dishes the table has: 2 Roti and 1 Dal is 3. */
export function dishCount(lines: readonly OrderLine[]): number {
  return lines.filter(isLive).reduce((n, l) => n + l.quantity, 0);
}

const byAdded = (a: OrderLine, b: OrderLine) =>
  a.addedAt !== b.addedAt ? a.addedAt - b.addedAt : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

/**
 * A tapped dish: one more of its plain draft line, or a new line. A dish
 * already sent gets a new line, so the kitchen reads "+1 Roti".
 */
export function addToDraft(
  lines: readonly OrderLine[],
  orderId: OrderId,
  { item, pricing }: OrderableItem,
  newId: LineId,
  at: number,
): OrderLine {
  const plain = lines.find(
    (l) => l.orderId === orderId && l.itemId === item.id && l.state.status === "draft" && l.note === "",
  );
  if (plain) return { ...plain, quantity: Math.min(plain.quantity + 1, QUANTITY_MAX) };
  return {
    id: newId,
    orderId,
    itemId: item.id,
    name: item.name,
    diet: item.diet,
    unitPrice: unitPrice(pricing),
    quantity: 1,
    note: "",
    addedAt: at,
    state: { status: "draft" },
  };
}

/** `settled`: the bill is closed; nothing on it changes any more. */
export type LineEditError = "notDraft" | "notSent" | "outOfRange" | "tooLong" | "settled";

/** Only a line still in the cart can change; the kitchen already has the rest. */
export function withQuantity(line: OrderLine, quantity: number): Result<OrderLine, LineEditError> {
  if (line.state.status !== "draft") return err("notDraft");
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > QUANTITY_MAX) return err("outOfRange");
  return ok({ ...line, quantity });
}

export function withNote(line: OrderLine, raw: string): Result<OrderLine, LineEditError> {
  if (line.state.status !== "draft") return err("notDraft");
  const note = normalizeName(raw);
  if (note.length > NOTE_MAX) return err("tooLong");
  return ok({ ...line, note });
}

/** Every draft line of the order, now with the kitchen as one round. */
export function sendDraft(lines: readonly OrderLine[], roundId: RoundId, at: number): OrderLine[] {
  return lines
    .filter((l) => l.state.status === "draft")
    .map((l) => ({ ...l, state: { status: "sent", roundId, sentAt: at } }));
}

/**
 * Cancels `quantity` of a sent line. Part of a line splits it: the rest stays
 * sent, the cancelled part becomes its own voided line.
 */
export function voidSent(
  line: OrderLine,
  quantity: number,
  reason: VoidReason | undefined,
  newId: LineId,
  at: number,
): Result<OrderLine[], LineEditError> {
  if (line.state.status !== "sent") return err("notSent");
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > line.quantity) return err("outOfRange");

  const { roundId, sentAt } = line.state;
  const voided: LineState = { status: "voided", roundId, sentAt, voidedAt: at, ...(reason && { reason }) };
  if (quantity === line.quantity) return ok([{ ...line, state: voided }]);
  return ok([
    { ...line, quantity: line.quantity - quantity },
    { ...line, id: newId, quantity, state: voided },
  ]);
}

// ---------------------------------------------------------------- the bill

export type BillView = {
  subtotal: Paise;
  discount?: Discount;
  due: Paise;
  paid: Paise;
  /** What is still to come; below zero when more came in than is due. */
  remaining: number;
  payments: Payment[];
};

/** What the order owes and has paid. A settled bill reads its snapshot, never the lines. */
export function billOf(order: Order, lines: readonly OrderLine[], payments: readonly Payment[]): BillView {
  const own = payments.filter((p) => p.orderId === order.id).sort((a, b) => a.receivedAt - b.receivedAt || (a.id < b.id ? -1 : 1));
  const { state } = order;
  const subtotal = state.status === "settled" ? state.subtotal : orderTotal(lines.filter((l) => l.orderId === order.id));
  const discount = state.status === "open" ? undefined : state.discount;
  const due = amountDue(subtotal, discount);
  const paid = amountPaid(own);
  return { subtotal, ...(discount && { discount }), due, paid, remaining: due - paid, payments: own };
}

export type BillError = "settled" | "unsent" | "empty";

/**
 * "Bill, please." Everything must have gone to the kitchen first: a dish
 * still in the cart is either forgotten or not wanted, and only staff know which.
 */
export function presentBill(order: Order, lines: readonly OrderLine[], at: number): Result<Order, BillError> {
  if (order.state.status === "settled") return err("settled");
  if (order.state.status === "billed") return ok(order);
  const own = lines.filter((l) => l.orderId === order.id);
  if (own.some((l) => l.state.status === "draft")) return err("unsent");
  if (!own.some(isLive)) return err("empty");
  return ok({ ...order, state: { status: "billed", billedAt: at } });
}

/** One more dish after the bill: the bill no longer stands, and its discount goes with it. */
export function reopenForDishes(order: Order): Order {
  return order.state.status === "billed" ? { ...order, state: { status: "open" } } : order;
}

export type PaymentError = "notBilled" | "unsent" | "discount" | "overpaid" | "zero" | "moreThanDue";

// The billed order with the discount on the sheet, checked against its dishes.
function billedWith(
  order: Order,
  lines: readonly OrderLine[],
  discount: Discount | undefined,
): Result<Order, "notBilled" | "unsent" | "discount"> {
  if (order.state.status !== "billed") return err("notBilled");
  const own = lines.filter((l) => l.orderId === order.id);
  if (own.some((l) => l.state.status === "draft")) return err("unsent");
  if (discount && (discount.amount <= 0 || discount.amount > orderTotal(own))) return err("discount");
  return ok({ ...order, state: { status: "billed", billedAt: order.state.billedAt, ...(discount && { discount }) } });
}

/**
 * Records money received. The payment that brings what is left to exactly
 * zero closes the bill: settling is never a separate step to forget.
 */
export function receivePayment(
  order: Order,
  lines: readonly OrderLine[],
  payments: readonly Payment[],
  discount: Discount | undefined,
  tender: Tender,
  amount: Paise,
  newId: PaymentId,
  at: number,
): Result<{ order: Order; payment: Payment }, PaymentError> {
  const withDiscount = billedWith(order, lines, discount);
  if (!withDiscount.ok) return withDiscount;
  const billed = withDiscount.value;
  const bill = billOf(billed, lines, payments);
  // More came in than is due (two devices took the same bill): someone has
  // to look before anything else is recorded.
  if (bill.remaining < 0) return err("overpaid");
  if (amount <= 0) return err("zero");
  if (amount > bill.remaining) return err("moreThanDue");

  const payment: Payment = { id: newId, orderId: order.id, amount, receivedAt: at, ...tender };
  return ok({ payment, order: amount === bill.remaining ? settled(billed, bill, at) : billed });
}

/** A bill with nothing left to pay — ₹0 dishes, or on the house — closes without a payment. */
export function closeBill(
  order: Order,
  lines: readonly OrderLine[],
  payments: readonly Payment[],
  discount: Discount | undefined,
  at: number,
): Result<Order, "notBilled" | "unsent" | "discount" | "unpaid"> {
  const withDiscount = billedWith(order, lines, discount);
  if (!withDiscount.ok) return withDiscount;
  const billed = withDiscount.value;
  const bill = billOf(billed, lines, payments);
  if (bill.remaining !== 0) return err("unpaid");
  return ok(settled(billed, bill, at));
}

function settled(order: Order, bill: BillView, at: number): Order {
  const billedAt = order.state.status === "billed" ? order.state.billedAt : at;
  return {
    ...order,
    state: { status: "settled", billedAt, settledAt: at, subtotal: bill.subtotal, ...(bill.discount && { discount: bill.discount }) },
  };
}

/**
 * "It was UPI, not cash." The method changes; the amount can't, so a
 * correction never moves the day's total, only which drawer it is in.
 */
export function correctPayment(payment: Payment, method: Tender["method"], at: number): Result<Payment, "unchanged"> {
  if (payment.method === method) return err("unchanged");
  const { id, orderId, amount, receivedAt } = payment;
  return ok({ id, orderId, amount, receivedAt, method, correctedAt: at });
}

export type SettledOrder = Order & { state: Extract<OrderState, { status: "settled" }> };

/**
 * The day's paid bills, latest first. A bill counts on its order's trading
 * day, like its token: one left open overnight and paid next morning
 * belongs to the evening it was served.
 */
export function settledOn(orders: readonly Order[], day: BusinessDate): SettledOrder[] {
  return orders
    .filter((o): o is SettledOrder => o.state.status === "settled" && o.businessDate === day)
    .sort((a, b) => b.state.settledAt - a.state.settledAt || (a.id < b.id ? 1 : -1));
}

// ---------------------------------------------------------------- the ticket

export type Round = { id: RoundId; number: number; sentAt: number; lines: OrderLine[] };

export type Ticket = {
  /** Oldest first, numbered 1, 2, 3 as the kitchen received them. */
  rounds: Round[];
  draft: OrderLine[];
  total: Paise;
  lastSentAt?: number;
};

export function ticketOf(lines: readonly OrderLine[]): Ticket {
  const byRound = new Map<RoundId, Omit<Round, "number">>();
  const draft: OrderLine[] = [];
  for (const line of [...lines].sort(byAdded)) {
    if (line.state.status === "draft") {
      draft.push(line);
      continue;
    }
    const { roundId, sentAt } = line.state;
    const round = byRound.get(roundId) ?? { id: roundId, sentAt, lines: [] };
    round.lines.push(line);
    byRound.set(roundId, round);
  }
  // Round numbers come from send order, never a stored counter: two offline
  // devices would both send "round 2".
  const rounds = [...byRound.values()]
    .sort((a, b) => a.sentAt - b.sentAt || (a.id < b.id ? -1 : 1))
    .map((round, i) => ({ ...round, number: i + 1 }));
  return { rounds, draft, total: orderTotal(lines), lastSentAt: rounds.at(-1)?.sentAt };
}

// ---------------------------------------------------------------- open orders

/**
 * An unsettled order with something on it. One whose every line was
 * cancelled frees its table — unless money was already taken for it.
 */
export type ActiveOrder = { order: Order; lines: OrderLine[]; ticket: Ticket; bill: BillView };

export function activeOrders(
  orders: readonly Order[],
  lines: readonly OrderLine[],
  payments: readonly Payment[] = [],
): ActiveOrder[] {
  const linesOf = new Map<OrderId, OrderLine[]>();
  for (const line of lines) linesOf.set(line.orderId, [...(linesOf.get(line.orderId) ?? []), line]);

  return orders
    .filter((o) => o.state.status !== "settled")
    .flatMap((order) => {
      const own = linesOf.get(order.id) ?? [];
      const bill = billOf(order, own, payments);
      return own.some(isLive) || bill.paid > 0 ? [{ order, lines: own, ticket: ticketOf(own), bill }] : [];
    })
    .sort((a, b) => a.order.openedAt - b.order.openedAt || (a.order.id < b.order.id ? -1 : 1));
}

/**
 * The order running at a table. Two devices offline can each open one; the
 * earliest wins, deterministically, until merging exists.
 */
export function activeOrderAt(tableId: TableId, active: readonly ActiveOrder[]): ActiveOrder | undefined {
  return active.find((a) => a.order.channel.type === "dineIn" && a.order.channel.tableId === tableId);
}

export type TableView = { table: DiningTable; active?: ActiveOrder };

export function floorOf(tables: readonly DiningTable[], active: readonly ActiveOrder[]): TableView[] {
  return sortByOrder(tables).map((table) => ({ table, active: activeOrderAt(table.id, active) }));
}

/** Today's next takeaway token. Tokens are never reused within a day, even if cancelled. */
export function nextToken(orders: readonly Order[], day: BusinessDate): number {
  const tokens = orders.flatMap((o) =>
    o.businessDate === day && o.channel.type === "takeaway" ? [o.channel.token] : [],
  );
  return Math.max(0, ...tokens) + 1;
}

// ---------------------------------------------------------------- price list

const CHANNEL_WORDS: Record<ChannelType, RegExp> = {
  dineIn: /\bdine|\bdining|\btable/i,
  takeaway: /take ?away|take ?out|parcel|pick ?up/i,
};

/**
 * The price list a new order starts with: the list named for its channel
 * ("Takeaway", "Parcel"), else the first. No setting to configure.
 */
export function defaultProfile(channel: ChannelType, profiles: readonly MenuProfile[]): ProfileId | undefined {
  const sorted = sortByOrder(profiles);
  return (sorted.find((p) => CHANNEL_WORDS[channel].test(p.name)) ?? sorted[0])?.id;
}

// ---------------------------------------------------------------- out today

/**
 * "No paneer today": its own record per item per day, never a field on the
 * item, where last-write-wins would clobber a price edit. The id is fixed by
 * item and day, so two devices marking the same dish converge on one record.
 * Tomorrow it no longer applies; nothing has to reset it.
 */
export type OutOfStock = { id: string; itemId: ItemId; businessDate: BusinessDate };

export const outOfStockId = (itemId: ItemId, day: BusinessDate): string => `${itemId}@${day}`;

export function outOn(records: readonly OutOfStock[], day: BusinessDate): Set<ItemId> {
  return new Set(records.filter((r) => r.businessDate === day).map((r) => r.itemId));
}
