import { liveQuery } from "dexie";
import type { DeviceSession } from "../../domain/signIn";
import { db, isShopTable, SYNCED_TABLES } from "./db";
import type { Scope } from "./repo";

const SESSION = "session";
const TOKEN = "deviceToken";

export type SignedInDevice = { session: DeviceSession; token: string; scope: Scope };

/** A session stored before linked phones existed was always an email sign-in. */
function readSession(value: string): DeviceSession {
  const stored = JSON.parse(value) as Record<string, unknown>;
  return ("via" in stored ? stored : { via: "email", ...stored }) as DeviceSession;
}

/** Emits who the device is signed in as (null when nobody), now and after every change. */
export function subscribeSession(onChange: (session: DeviceSession | null) => void): () => void {
  const subscription = liveQuery(() => db.meta.get(SESSION)).subscribe({
    next: (row) => onChange(row ? readSession(row.value) : null),
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
    const [account, brand, shop] = await db.meta.bulkGet(["accountId", "brandId", "shopId"]);
    if (account?.value !== scope.accountId || brand?.value !== scope.brandId || shop?.value !== scope.shopId) {
      for (const name of SYNCED_TABLES) {
        const shopLevel = isShopTable(name);
        // Still queued in the outbox: nothing reaches the server before sign-in.
        await db[name].toCollection().modify((row) => {
          row.accountId = scope.accountId;
          if (shopLevel) row.shopId = scope.shopId;
          else row.brandId = scope.brandId;
        });
      }
    }
    await db.meta.bulkPut([
      { key: "accountId", value: scope.accountId },
      { key: "brandId", value: scope.brandId },
      { key: "shopId", value: scope.shopId },
      { key: TOKEN, value: token },
      { key: SESSION, value: JSON.stringify(session) },
    ]);
  });
}

/** The server no longer knows this device: back to keeping work on it alone. Nothing is lost. */
export async function forgetSession(): Promise<void> {
  await db.meta.bulkDelete([SESSION, TOKEN, CURSOR]);
}

/** Keeps the server's newer token for this device. */
export async function renewToken(token: string): Promise<void> {
  await db.meta.put({ key: TOKEN, value: token });
}

/**
 * This phone was removed from the restaurant: the restaurant's records go
 * from it, with its sign-in and setup, and it starts again as a new phone.
 */
export async function clearRestaurant(): Promise<void> {
  const tables = [db.meta, db.outbox, ...SYNCED_TABLES.map((name) => db[name])];
  await db.transaction("rw", tables, async () => {
    for (const table of tables) await table.clear();
  });
}

const CURSOR = "syncCursor";

/** Where the next pull starts: the last sync number this device has applied. */
export async function syncCursor(): Promise<number> {
  return Number((await db.meta.get(CURSOR))?.value ?? 0);
}

export const CURSOR_KEY = CURSOR;
