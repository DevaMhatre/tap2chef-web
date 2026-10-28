import { useSyncExternalStore } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { usePorts } from "./PortsProvider";

export type SyncStatus =
  | { connection: "online"; pendingChanges: number }
  | { connection: "offline"; pendingChanges: number };

export function useSyncStatus(): SyncStatus {
  const { network, sync } = usePorts();
  const online = useSyncExternalStore(network.subscribe, network.isOnline);
  const pendingChanges = useLiveQuery(() => sync.pendingChanges(), [sync], 0);

  return { connection: online ? "online" : "offline", pendingChanges };
}
