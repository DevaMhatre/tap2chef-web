import { liveQuery } from "dexie";
import type { DeviceSession } from "../../domain/signIn";
import { db, isShopTable, SYNCED_TABLES } from "./db";
import type { Scope } from "./repo";

const SESSION = "session";
const TOKEN = "deviceToken";

export type SignedInDevice = { session: DeviceSession; token: string; scope: Scope };

/** Emits who the device is signed in as (null when nobody), now and after every change. */
export function subscribeSession(onChange: (session: DeviceSession | null) => void): () => void {
  const subscription = liveQuery(() => db.meta.get(SESSION)).subscribe({
    next: (row) => onChange(row ? (JSON.parse(row.value) as DeviceSession) : null),
    error: (error) => console.error(error),
  });
  return () => subscription.unsubscribe();
}

export async function deviceToken(): Promise<string | undefined> {
  return (await db.meta.get(TOKEN))?.value;
}

/**
 * Files the device under the account it signed in to, in one transaction. A
 * new owner's account was made from the device's own ids, so nothing moves;
 * signing in to an existing account brings this device's records into it.
 */
export async function adoptSession({ session, token, scope }: SignedInDevice): Promise<void> {
  const tables = SYNCED_TABLES.map((name) => db[name]);
  await db.transaction("rw", [db.meta, ...tables], async () => {
    const [account, shop] = await db.meta.bulkGet(["accountId", "shopId"]);
    if (account?.value !== scope.accountId || shop?.value !== scope.shopId) {
      for (const name of SYNCED_TABLES) {
        const shopLevel = isShopTable(name);
        // Still queued in the outbox: nothing reaches the server before sign-in.
        await db[name].toCollection().modify((row) => {
          row.accountId = scope.accountId;
          if (shopLevel) row.shopId = scope.shopId;
        });
      }
    }
    await db.meta.bulkPut([
      { key: "accountId", value: scope.accountId },
      { key: "shopId", value: scope.shopId },
      { key: TOKEN, value: token },
      { key: SESSION, value: JSON.stringify(session) },
    ]);
  });
}
