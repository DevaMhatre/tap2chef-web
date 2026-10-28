import { useLiveQuery } from "dexie-react-hooks";
import { usePorts } from "./PortsProvider";

export type DeviceStorage =
  | { state: "loading" }
  | { state: "ready"; storedRecords: number; pendingChanges: number };

export function useDeviceStorage(): DeviceStorage {
  const { sync } = usePorts();

  const result = useLiveQuery(
    async () => ({
      storedRecords: await sync.storedRecords(),
      pendingChanges: await sync.pendingChanges(),
    }),
    [sync],
  );

  return result ? { state: "ready", ...result } : { state: "loading" };
}
