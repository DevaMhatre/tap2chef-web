import { activeOrders, floorOf, type TableView } from "../domain/order";
import { addPaise, paise, type Paise } from "../domain/money";
import { TABLE_COUNT } from "../domain/tables";
import type { OrderCommands } from "./orderDesk";
import { useOrderDesk } from "./useOrderDesk";

export type { TableView };

export type Tables =
  | { state: "loading" }
  | { state: "empty"; suggestedCount: number; setUp: OrderCommands["setUpTables"] }
  | ({
      state: "ready";
      floor: TableView[];
      /** Handed a bill and not yet paid in full: the money still out on the floor. */
      waiting: Paise;
    } & Pick<OrderCommands, "addTable" | "renameTable" | "removeTable">);

export type ReadyTables = Extract<Tables, { state: "ready" }>;

export function useTables(): Tables {
  const { commands, snapshot } = useOrderDesk();
  if (!snapshot) return { state: "loading" };
  if (snapshot.tables.length === 0) {
    return { state: "empty", suggestedCount: TABLE_COUNT.suggested, setUp: commands.setUpTables };
  }
  const floor = floorOf(snapshot.tables, activeOrders(snapshot.orders, snapshot.lines, snapshot.payments));
  const owed = floor.flatMap(({ active }) =>
    active?.order.state.status === "billed" && active.bill.remaining > 0 ? [paise(active.bill.remaining)] : [],
  );
  return {
    state: "ready",
    floor,
    waiting: addPaise(...owed),
    addTable: commands.addTable,
    renameTable: commands.renameTable,
    removeTable: commands.removeTable,
  };
}
