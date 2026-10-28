import { useEffect, useMemo, useState } from "react";
import { createOrderDesk, type OrderCommands } from "./orderDesk";
import type { MenuSnapshot, OrderSnapshot } from "./ports";
import { usePorts } from "./PortsProvider";

/** The desk's commands and its latest snapshot; null until the first one arrives. */
export function useOrderDesk(): { commands: OrderCommands; snapshot: OrderSnapshot | null } {
  const { orders, ids, clock } = usePorts();
  const desk = useMemo(() => createOrderDesk(orders, ids, clock), [orders, ids, clock]);
  const [snapshot, setSnapshot] = useState<OrderSnapshot | null>(null);
  useEffect(() => desk.subscribe(setSnapshot), [desk]);
  return { commands: desk.commands, snapshot };
}

/** The menu as stored, read-only, for screens that order from it. */
export function useMenuSnapshot(): MenuSnapshot | null {
  const { menu } = usePorts();
  const [snapshot, setSnapshot] = useState<MenuSnapshot | null>(null);
  useEffect(() => menu.subscribe(setSnapshot), [menu]);
  return snapshot;
}
