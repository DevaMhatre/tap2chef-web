import {
  activeOrders,
  businessDate,
  settledOn,
  type ActiveOrder,
  type CorrectionError,
  type OrderId,
  type OrderLine,
  type SettledOrder,
} from "../domain/order";
import type { Paise } from "../domain/money";
import { err, type Result } from "../domain/result";
import { amountPaid, paymentsFor, quoteBill, takings, type BillQuote, type PayBy, type Takings } from "../domain/settlement";
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

export type SettledSummary = { order: SettledOrder; lines: OrderLine[]; label: OrderLabel; paid: Paise };

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
      /** A paid bill's split as typed: UPI is whatever the cash leaves. */
      quoteSplit(paid: Paise, cash: string): BillQuote["split"];
      /** "It was UPI, not cash." Same amount, other method; the bill shows it was corrected. */
      correct(orderId: OrderId, by: PayBy, cash: string): Promise<Result<void, CorrectionError | "invalid">>;
      /** An id for a new takeaway. Nothing is stored until its first dish. */
      newTakeaway(): OrderId;
    };

export type ReadyOrders = Extract<Orders, { state: "ready" }>;

export function useOrders(): Orders {
  const { ids, clock } = usePorts();
  const { commands, snapshot } = useOrderDesk();
  if (!snapshot) return { state: "loading" };

  const today = businessDate(clock.now());
  const settled = settledOn(snapshot.orders, today).map((order) => ({
    order,
    lines: snapshot.lines.filter((l) => l.orderId === order.id),
    label: labelOf({ order }, snapshot.tables),
    paid: amountPaid(order.state.bill.payments),
  }));
  const all = activeOrders(snapshot.orders, snapshot.lines).map((a) => ({ ...a, label: labelOf(a, snapshot.tables) }));
  return {
    state: "ready",
    earlier: all.filter((a) => a.order.businessDate < today),
    today: all.filter((a) => a.order.businessDate >= today),
    newTakeaway: () => ids.newId() as OrderId,
    settled,
    takings: takings(settled.map((s) => s.order.state.bill)),
    quoteSplit: (paid, cash) => quoteBill(paid, { finalAmount: "", reason: "", cash }).split,
    correct(orderId, by, cash) {
      const bill = settled.find((s) => s.order.id === orderId);
      if (!bill) return Promise.resolve(err("notSettled"));
      const payments = paymentsFor(by, quoteBill(bill.paid, { finalAmount: "", reason: "", cash }));
      if (!payments) return Promise.resolve(err("invalid"));
      return commands.correctPayments(orderId, payments);
    },
  };
}
