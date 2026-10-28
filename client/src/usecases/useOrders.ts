import { activeOrders, businessDate, type ActiveOrder, type OrderId } from "../domain/order";
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

export type Orders =
  | { state: "loading" }
  | {
      state: "ready";
      /** Still open from an earlier day: never silently lost from the numbers. */
      earlier: OrderSummary[];
      today: OrderSummary[];
      /** An id for a new takeaway. Nothing is stored until its first dish. */
      newTakeaway(): OrderId;
    };

export function useOrders(): Orders {
  const { ids, clock } = usePorts();
  const { snapshot } = useOrderDesk();
  if (!snapshot) return { state: "loading" };

  const today = businessDate(clock.now());
  const all = activeOrders(snapshot.orders, snapshot.lines).map((a) => ({ ...a, label: labelOf(a, snapshot.tables) }));
  return {
    state: "ready",
    earlier: all.filter((a) => a.order.businessDate < today),
    today: all.filter((a) => a.order.businessDate >= today),
    newTakeaway: () => ids.newId() as OrderId,
  };
}
