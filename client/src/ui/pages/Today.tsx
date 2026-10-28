import { useDeviceStorage } from "../../usecases/useDeviceStorage";

// Placeholder until the sales dashboard lands: shows that the local store is
// working and what is waiting to sync.
export default function Today() {
  const storage = useDeviceStorage();

  return (
    <section className="mx-auto max-w-3xl">
      <h1 className="mb-4 text-2xl font-extrabold tracking-tight">Today</h1>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-line bg-surface p-5">
          <div className="text-xs font-bold uppercase tracking-wider text-muted">
            Saved on this device
          </div>
          <div className="mt-1 text-3xl font-black tabular-nums">
            {storage.state === "ready" ? storage.storedRecords : "…"}
          </div>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-5">
          <div className="text-xs font-bold uppercase tracking-wider text-muted">
            Waiting to sync
          </div>
          <div className="mt-1 text-3xl font-black tabular-nums">
            {storage.state === "ready" ? storage.pendingChanges : "…"}
          </div>
        </div>
      </div>
    </section>
  );
}
