import { liveQuery } from "dexie";
import type { Service, ShopDetails } from "../../domain/setup";
import type { ShopRepository } from "../../usecases/ports";
import { db, type StoredRecord } from "./db";
import { isText } from "./parse";
import { getScope, writeAll } from "./repo";

const SERVICES: readonly string[] = ["dineIn", "takeaway", "both"] satisfies Service[];

// Checked on read: the record can arrive from another phone through sync.
function toDetails(row: StoredRecord | undefined): ShopDetails | null {
  if (!row || row.deleted || !isText(row.name) || typeof row.service !== "string" || !SERVICES.includes(row.service)) return null;
  return { name: row.name, service: row.service as Service };
}

async function readDetails(): Promise<ShopDetails | null> {
  const shopId = (await db.meta.get("shopId"))?.value;
  return shopId ? toDetails(await db.shopDetails.get(shopId)) : null;
}

export const dexieShopRepository: ShopRepository = {
  subscribe(onChange) {
    const subscription = liveQuery(readDetails).subscribe({
      next: onChange,
      error: (error) => console.error("Shop details query failed", error),
    });
    return () => subscription.unsubscribe();
  },

  // One record per shop, named by the shop, so two phones answering at once
  // both write the same record and the later one wins.
  async write(details) {
    const { shopId } = await getScope();
    await writeAll([{ table: "shopDetails", record: { id: shopId, ...details }, op: "put" }]);
  },
};
