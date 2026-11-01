import { useEffect, useMemo, useState } from "react";
import type { DeviceSession } from "../domain/signIn";
import { createOrderDesk, type OrderCommands } from "./orderDesk";
import type { MenuSnapshot, OrderSnapshot } from "./ports";
import { usePorts } from "./PortsProvider";

/** The desk's commands and its latest snapshot; null until the first one arrives. */
export function useOrderDesk(): { commands: OrderCommands; snapshot: OrderSnapshot | null } {
  const { orders, ids, clock } = usePorts();
  const who = usePersonName();
  const desk = useMemo(() => createOrderDesk(orders, ids, clock, who), [orders, ids, clock, who]);
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

/** "Owner" on the owner's own phone; the person's name on a phone added for them; none on a phone working alone. */
/**
 * Who is working this phone, for "by Ravi": a reader asked at the moment money
 * is taken or a dish cancelled, so signing in mid-service needs nothing rebuilt.
 */
export function usePersonName(): () => string | undefined {
  const { account } = usePorts();
  const [who] = useState(() => ({ name: undefined as string | undefined }));
  useEffect(() => account?.subscribe((session) => (who.name = personName(session))), [account, who]);
  return useMemo(() => () => who.name, [who]);
}

export function personName(session: DeviceSession | null): string | undefined {
  if (!session) return undefined;
  if (session.via === "email") return "Owner";
  return session.person?.name ?? "Owner";
}
