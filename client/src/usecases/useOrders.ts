import {
  activeOrders,
  billOf,
  canRemove,
  counts,
  businessDate,
  settledOn,
  sharedTokens,
  type ActiveOrder,
  type BillView,
  type OrderId,
  type OrderLine,
  type Payment,
  type PaymentId,
  type RemoveError,
  type SettledOrder,
} from "../domain/order";
import type { Result } from "../domain/result";
import { takings, type PaymentMethod, type Takings } from "../domain/settlement";
import type { DiningTable } from "../domain/tables";
import type { Undo } from "./orderDesk";
import { usePorts } from "./PortsProvider";
import { useOrderDesk } from "./useOrderDesk";

/**
 * How staff name an order: by its table, or by its token. `shared`: another
 * of the day's takeaways has the same token (two phones, seconds apart, or one
 * offline). It is shown, never renumbered: the customer heard the number.
 */
export type OrderLabel = { kind: "table"; name: string } | { kind: "token"; token: number; shared: boolean };

export function labelOf(
  active: Pick<ActiveOrder, "order">,
  tables: readonly DiningTable[],
  shared: ReadonlySet<number> = new Set(),
): OrderLabel {
  const { channel } = active.order;
  if (channel.type === "takeaway") return { kind: "token", token: channel.token, shared: shared.has(channel.token) };
  // A table removed on another device still names its order.
  return { kind: "table", name: tables.find((t) => t.id === channel.tableId)?.name ?? "?" };
}

export type OrderSummary = ActiveOrder & { label: OrderLabel };

export type SettledSummary = { order: SettledOrder; lines: OrderLine[]; label: OrderLabel; bill: BillView };

export type Orders =
  | { state: "loading" }
  | {
      state: "ready";
      /** Still open from an earlier day: never silently lost from the numbers. */
      earlier: OrderSummary[];
      today: OrderSummary[];
      /** Today's paid bills, latest first, and what they brought in by drawer. */
      settled: SettledSummary[];
      takings: Takings;
      /** An id for a new takeaway. Nothing is stored until its first dish. */
      newTakeaway(): OrderId;
      /** "It was UPI, not cash." Same amount, other method; the bill shows it was corrected. */
      correctPayment(paymentId: PaymentId, method: PaymentMethod): Promise<Result<void, "unchanged" | "removed" | "missing">>;
      /** Only an excess comes off a settled bill: `canRemove` says which. */
      removePayment(paymentId: PaymentId): Promise<Result<Undo, RemoveError | "missing">>;
      canRemove(bill: SettledSummary, payment: Payment): boolean;
    };

export type ReadyOrders = Extract<Orders, { state: "ready" }>;

export function useOrders(): Orders {
  const { ids, clock } = usePorts();
  const { commands, snapshot } = useOrderDesk();
  if (!snapshot) return { state: "loading" };

  const today = businessDate(clock.now());
  const sharedOn = new Map<string, Set<number>>();
  const shared = (order: { businessDate: typeof today }) => {
    if (!sharedOn.has(order.businessDate)) sharedOn.set(order.businessDate, sharedTokens(snapshot.orders, order.businessDate));
    return sharedOn.get(order.businessDate)!;
  };
  const settled = settledOn(snapshot.orders, today).map((order) => {
    const lines = snapshot.lines.filter((l) => l.orderId === order.id);
    return { order, lines, label: labelOf({ order }, snapshot.tables, shared(order)), bill: billOf(order, lines, snapshot.payments) };
  });
  const all = activeOrders(snapshot.orders, snapshot.lines, snapshot.payments).map((a) => ({
    ...a,
    label: labelOf(a, snapshot.tables, shared(a.order)),
  }));
  return {
    state: "ready",
    earlier: all.filter((a) => a.order.businessDate < today),
    today: all.filter((a) => a.order.businessDate >= today),
    settled,
    takings: takings(settled.flatMap((s) => s.bill.payments.filter(counts))),
    newTakeaway: () => ids.newId() as OrderId,
    correctPayment: commands.correctPayment,
    removePayment: commands.removePayment,
    canRemove: (bill, payment) => canRemove(payment, bill.order, bill.bill),
  };
}
