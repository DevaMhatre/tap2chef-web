import { activeOrders, floorOf, type TableView } from "../domain/order";
import { TABLE_COUNT } from "../domain/tables";
import type { OrderCommands } from "./orderDesk";
import { useOrderDesk } from "./useOrderDesk";

export type { TableView };

export type Tables =
  | { state: "loading" }
  | { state: "empty"; suggestedCount: number; setUp: OrderCommands["setUpTables"] }
  | ({ state: "ready"; floor: TableView[] } & Pick<OrderCommands, "addTable" | "renameTable" | "removeTable">);

export type ReadyTables = Extract<Tables, { state: "ready" }>;

export function useTables(): Tables {
  const { commands, snapshot } = useOrderDesk();
  if (!snapshot) return { state: "loading" };
  if (snapshot.tables.length === 0) {
    return { state: "empty", suggestedCount: TABLE_COUNT.suggested, setUp: commands.setUpTables };
  }
  return {
    state: "ready",
    floor: floorOf(snapshot.tables, activeOrders(snapshot.orders, snapshot.lines)),
    addTable: commands.addTable,
    renameTable: commands.renameTable,
    removeTable: commands.removeTable,
  };
}
