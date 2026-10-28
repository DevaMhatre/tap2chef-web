import type { SyncRepository } from "../../usecases/ports";
import { db, SYNCED_TABLES } from "./db";

export const dexieSyncRepository: SyncRepository = {
  pendingChanges: () => db.outbox.count(),
  async storedRecords() {
    const counts = await Promise.all(SYNCED_TABLES.map((name) => db[name].count()));
    return counts.reduce((sum, n) => sum + n, 0);
  },
};
