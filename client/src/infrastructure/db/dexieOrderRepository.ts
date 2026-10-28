import { liveQuery } from "dexie";
import type { Diet, ItemId, ProfileId } from "../../domain/menu";
import type { Paise } from "../../domain/money";
import type {
  BusinessDate,
  LineId,
  LineState,
  Order,
  OrderChannel,
  OrderId,
  OrderLine,
  OrderState,
  OutOfStock,
  RoundId,
  VoidReason,
} from "../../domain/order";
import type { Bill, Discount, Payment } from "../../domain/settlement";
import type { DiningTable, TableId } from "../../domain/tables";
import type { OrderChange, OrderRecord, OrderRepository, OrderSnapshot } from "../../usecases/ports";
import { db, type StoredRecord, type SyncedTable } from "./db";
import { isObject, isPaise, isText, isTime, readAll } from "./parse";
import { writeAll } from "./repo";

// Anti-corruption layer between stored records and the order domain.

const TABLES: Record<OrderRecord["table"], SyncedTable> = {
  tables: "diningTables",
  orders: "orders",
  lines: "orderItems",
  outOfStock: "outOfStock",
};

const DIETS: readonly string[] = ["veg", "nonVeg", "egg"] satisfies Diet[];
const REASONS: readonly string[] = ["wrongEntry", "guestChangedMind", "outOfStock"] satisfies VoidReason[];
const isDate = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

function toTable(r: StoredRecord): DiningTable | undefined {
  if (!isText(r.name) || !isText(r.sortKey)) return undefined;
  return { id: r.id as TableId, name: r.name, sortKey: r.sortKey };
}

function toChannel(value: unknown): OrderChannel | undefined {
  if (!isObject(value)) return undefined;
  if (value.type === "dineIn" && isText(value.tableId)) return { type: "dineIn", tableId: value.tableId as TableId };
  if (value.type === "takeaway" && Number.isSafeInteger(value.token) && (value.token as number) > 0) {
    return { type: "takeaway", token: value.token as number };
  }
  return undefined;
}

function toPayment(value: unknown): Payment | undefined {
  if (!isObject(value) || !isPaise(value.amount) || value.amount === 0) return undefined;
  const amount = value.amount as Paise;
  if (value.method === "cash") return { method: "cash", amount };
  if (value.method !== "upi") return undefined;
  if (value.ref !== undefined && !isText(value.ref)) return undefined;
  return { method: "upi", amount, ...(value.ref !== undefined && { ref: value.ref }) };
}

function toDiscount(value: unknown): Discount | undefined {
  if (!isObject(value) || !isPaise(value.amount) || typeof value.reason !== "string") return undefined;
  return { amount: value.amount as Paise, reason: value.reason };
}

function toBill(value: unknown): Bill | undefined {
  if (!isObject(value) || !isPaise(value.subtotal) || !Array.isArray(value.payments)) return undefined;
  const payments = value.payments.map(toPayment);
  if (payments.some((p) => !p)) return undefined;
  const discount = value.discount === undefined ? undefined : toDiscount(value.discount);
  if (value.discount !== undefined && !discount) return undefined;
  return { subtotal: value.subtotal as Paise, ...(discount && { discount }), payments: payments as Payment[] };
}

// `status` is also stored flat, so open orders can be read by index. The
// state itself is one field, replaced whole: an undone settle leaves no bill behind.
function toOrderState(status: unknown, value: unknown): OrderState | undefined {
  if (status === "open") return { status: "open" };
  if (status !== "settled" || !isObject(value) || !isTime(value.settledAt)) return undefined;
  const bill = toBill(value.bill);
  if (!bill || (value.correctedAt !== undefined && !isTime(value.correctedAt))) return undefined;
  return {
    status: "settled",
    settledAt: value.settledAt,
    bill,
    ...(value.correctedAt !== undefined && { correctedAt: value.correctedAt }),
  };
}

function toOrder(r: StoredRecord): Order | undefined {
  const channel = toChannel(r.channel);
  if (!channel || !isText(r.profileId) || !isDate(r.businessDate) || !isTime(r.openedAt)) return undefined;
  const state = toOrderState(r.status, r.state);
  if (!state) return undefined;
  return {
    id: r.id as OrderId,
    channel,
    profileId: r.profileId as ProfileId,
    businessDate: r.businessDate as BusinessDate,
    openedAt: r.openedAt,
    state,
  };
}

function fromOrder(order: Order) {
  return { ...order, status: order.state.status };
}

function toLineState(value: unknown): LineState | undefined {
  if (!isObject(value)) return undefined;
  if (value.status === "draft") return { status: "draft" };
  if (!isText(value.roundId) || !isTime(value.sentAt)) return undefined;
  const sent = { roundId: value.roundId as RoundId, sentAt: value.sentAt };
  if (value.status === "sent") return { status: "sent", ...sent };
  if (value.status !== "voided" || !isTime(value.voidedAt)) return undefined;
  if (value.reason !== undefined && !REASONS.includes(value.reason as string)) return undefined;
  return { status: "voided", ...sent, voidedAt: value.voidedAt, ...(value.reason !== undefined && { reason: value.reason as VoidReason }) };
}

function toLine(r: StoredRecord): OrderLine | undefined {
  const state = toLineState(r.state);
  if (!state || !isText(r.orderId) || !isText(r.itemId) || !isText(r.name)) return undefined;
  if (typeof r.diet !== "string" || !DIETS.includes(r.diet)) return undefined;
  if (!isPaise(r.unitPrice) || !Number.isSafeInteger(r.quantity) || (r.quantity as number) < 1) return undefined;
  if (typeof r.note !== "string" || !isTime(r.addedAt)) return undefined;
  return {
    id: r.id as LineId,
    orderId: r.orderId as OrderId,
    itemId: r.itemId as ItemId,
    name: r.name,
    diet: r.diet as Diet,
    unitPrice: r.unitPrice as Paise,
    quantity: r.quantity as number,
    note: r.note,
    addedAt: r.addedAt,
    state,
  };
}

function toOutOfStock(r: StoredRecord): OutOfStock | undefined {
  if (!isText(r.itemId) || !isDate(r.businessDate)) return undefined;
  return { id: r.id, itemId: r.itemId as ItemId, businessDate: r.businessDate as BusinessDate };
}

async function readOrders(since: BusinessDate): Promise<OrderSnapshot> {
  const [tables, open, recent, outOfStock] = await Promise.all([
    db.diningTables.toArray(),
    db.orders.where("status").equals("open").toArray(),
    // Every order of the day, whatever its state: takeaway tokens count them.
    db.orders.where("businessDate").aboveOrEqual(since).toArray(),
    db.outOfStock.where("businessDate").aboveOrEqual(since).toArray(),
  ]);
  const orderRows = [...new Map([...open, ...recent].map((r) => [r.id, r])).values()];
  const orders = readAll(orderRows, toOrder, "order");
  const lines = await db.orderItems
    .where("orderId")
    .anyOf(orders.map((o) => o.id))
    .toArray();
  return {
    tables: readAll(tables, toTable, "table"),
    orders,
    lines: readAll(lines, toLine, "line"),
    outOfStock: readAll(outOfStock, toOutOfStock, "out-of-stock"),
  };
}

export const dexieOrderRepository: OrderRepository = {
  subscribe(since, onChange) {
    const subscription = liveQuery(() => readOrders(since)).subscribe({
      next: onChange,
      error: (error) => console.error("Order query failed", error),
    });
    return () => subscription.unsubscribe();
  },

  write: (changes: readonly OrderChange[]) =>
    writeAll(
      changes.map((c) => ({
        table: TABLES[c.table],
        record: c.table === "orders" ? fromOrder(c.record) : c.record,
        op: c.op,
      })),
    ),
};
