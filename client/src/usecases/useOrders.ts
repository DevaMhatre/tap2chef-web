import {
  activeOrders,
  billOf,
  businessDate,
  settledOn,
  type ActiveOrder,
  type BillView,
  type OrderId,
  type OrderLine,
  type PaymentId,
  type SettledOrder,
} from "../domain/order";
import type { Result } from "../domain/result";
import { takings, type PaymentMethod, type Takings } from "../domain/settlement";
import type { DiningTable } from "../domain/tables";
import { usePorts } from "./PortsProvider";
import { useOrderDesk } from "./useOrderDesk";

/** How staff name an order: by its table, or by its token. */
export type OrderLabel = { kind: "table"; name: string } | { kind: "token"; token: number };

export function labelOf(active: Pick<ActiveOrder, "order">, tables: readonly DiningTable[]): OrderLabel {
  const { channel } = active.order;
  if (channel.type === "takeaway") return { kind: "token", token: channel.token };
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
      correctPayment(paymentId: PaymentId, method: PaymentMethod): Promise<Result<void, "unchanged" | "missing">>;
    };

export type ReadyOrders = Extract<Orders, { state: "ready" }>;

export function useOrders(): Orders {
  const { ids, clock } = usePorts();
  const { commands, snapshot } = useOrderDesk();
  if (!snapshot) return { state: "loading" };

  const today = businessDate(clock.now());
  const settled = settledOn(snapshot.orders, today).map((order) => {
    const lines = snapshot.lines.filter((l) => l.orderId === order.id);
    return { order, lines, label: labelOf({ order }, snapshot.tables), bill: billOf(order, lines, snapshot.payments) };
  });
  const all = activeOrders(snapshot.orders, snapshot.lines, snapshot.payments).map((a) => ({
    ...a,
    label: labelOf(a, snapshot.tables),
  }));
  return {
    state: "ready",
    earlier: all.filter((a) => a.order.businessDate < today),
    today: all.filter((a) => a.order.businessDate >= today),
    settled,
    takings: takings(settled.flatMap((s) => s.bill.payments)),
    newTakeaway: () => ids.newId() as OrderId,
    correctPayment: commands.correctPayment,
  };
}
