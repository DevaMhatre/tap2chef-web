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
  Payment,
  PaymentId,
  RoundId,
  VoidReason,
} from "../../domain/order";
import type { Discount } from "../../domain/settlement";
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
  payments: "payments",
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

function toDiscount(value: unknown): Discount | undefined {
  if (!isObject(value) || !isPaise(value.amount) || value.amount === 0 || typeof value.reason !== "string") return undefined;
  return { amount: value.amount as Paise, reason: value.reason };
}

// `status` is also stored flat, so open orders can be read by index. The
// state itself is one field, replaced whole: an undone settle leaves nothing behind.
function toOrderState(status: unknown, value: unknown): OrderState | undefined {
  if (status === "open") return { status: "open" };
  if (!isObject(value) || !isTime(value.billedAt)) return undefined;
  const discount = value.discount === undefined ? undefined : toDiscount(value.discount);
  if (value.discount !== undefined && !discount) return undefined;
  const extra = discount ? { discount } : {};
  if (status === "billed") return { status: "billed", billedAt: value.billedAt, ...extra };
  if (status !== "settled" || !isTime(value.settledAt) || !isPaise(value.subtotal)) return undefined;
  return { status: "settled", billedAt: value.billedAt, settledAt: value.settledAt, subtotal: value.subtotal as Paise, ...extra };
}

function toPayment(r: StoredRecord): Payment | undefined {
  if (!isText(r.orderId) || !isPaise(r.amount) || r.amount === 0 || !isTime(r.receivedAt)) return undefined;
  if (r.correctedAt !== undefined && !isTime(r.correctedAt)) return undefined;
  const base = {
    id: r.id as PaymentId,
    orderId: r.orderId as OrderId,
    amount: r.amount as Paise,
    receivedAt: r.receivedAt,
    ...(r.correctedAt !== undefined && { correctedAt: r.correctedAt }),
  };
  if (r.method === "cash") return { ...base, method: "cash" };
  if (r.method !== "upi" || (r.ref !== undefined && !isText(r.ref))) return undefined;
  return { ...base, method: "upi", ...(r.ref !== undefined && { ref: r.ref }) };
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
  const ids = orders.map((o) => o.id);
  const [lines, payments] = await Promise.all([
    db.orderItems.where("orderId").anyOf(ids).toArray(),
    db.payments.where("orderId").anyOf(ids).toArray(),
  ]);
  return {
    tables: readAll(tables, toTable, "table"),
    orders,
    lines: readAll(lines, toLine, "line"),
    payments: readAll(payments, toPayment, "payment"),
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
