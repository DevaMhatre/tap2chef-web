import { liveQuery } from "dexie";
import type { SetupProgress } from "../../domain/setup";
import type { LocalSetup, SetupStore } from "../../usecases/ports";
import { db, SYNCED_TABLES } from "./db";

// This phone's own memory of its setup. Never synced: a second phone of the
// same restaurant signs in to it and has nothing to set up.
const PROGRESS = "setup";
const CARD = "safeCopyCardDismissed";
const STEPS: readonly string[] = ["account", "name", "service", "tables", "menu", "ready", "done"] satisfies SetupProgress["step"][];

function toProgress(value: string | undefined): SetupProgress | null {
  if (value === undefined) return null;
  try {
    const parsed = JSON.parse(value) as SetupProgress;
    if (!STEPS.includes(parsed.step)) return null;
    if (parsed.step === "service" && typeof parsed.name !== "string") return { step: "name" };
    return parsed;
  } catch {
    return null;
  }
}

async function readLocal(): Promise<LocalSetup> {
  const [progress, card] = await db.meta.bulkGet([PROGRESS, CARD]);
  return { progress: toProgress(progress?.value), cardDismissed: card !== undefined };
}

export const dexieSetupStore: SetupStore = {
  subscribe(onChange) {
    const subscription = liveQuery(readLocal).subscribe({
      next: onChange,
      error: (error) => console.error("Setup query failed", error),
    });
    return () => subscription.unsubscribe();
  },

  async save(progress) {
    await db.meta.put({ key: PROGRESS, value: JSON.stringify(progress) });
  },

  async begin(progress) {
    await db.transaction("rw", db.meta, async () => {
      if (!(await db.meta.get(PROGRESS))) await db.meta.put({ key: PROGRESS, value: JSON.stringify(progress) });
    });
  },

  async isEmptyDevice() {
    if (await db.meta.get("session")) return false;
    const counts = await Promise.all(SYNCED_TABLES.map((table) => db[table].count()));
    return counts.every((n) => n === 0);
  },

  async dismissCard() {
    await db.meta.put({ key: CARD, value: "1" });
  },
};
