import { liveQuery } from "dexie";
import type { Category, CategoryId, Diet, ItemId, MenuItem, MenuProfile, Pricing, ProfileId } from "../../domain/menu";
import type { MenuChange, MenuRecord, MenuRepository, MenuSnapshot } from "../../usecases/ports";
import { db, type StoredRecord, type SyncedTable } from "./db";
import { getTenantId, save } from "./repo";

// Anti-corruption layer between stored records and the menu domain. Records
// can arrive from other devices through sync, so they are checked on read and
// malformed ones are skipped rather than trusted.

const TABLES: Record<MenuRecord["table"], SyncedTable> = {
  profiles: "menuProfiles",
  categories: "categories",
  items: "items",
};

const DIETS: readonly string[] = ["veg", "nonVeg", "egg"] satisfies Diet[];

const isText = (value: unknown): value is string => typeof value === "string" && value !== "";
const isPaise = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;

function toProfile(r: StoredRecord): MenuProfile | undefined {
  if (!isText(r.name) || !isText(r.sortKey)) return undefined;
  return { id: r.id as ProfileId, name: r.name, sortKey: r.sortKey };
}

function toCategory(r: StoredRecord): Category | undefined {
  if (!isText(r.name) || !isText(r.sortKey)) return undefined;
  return { id: r.id as CategoryId, name: r.name, sortKey: r.sortKey };
}

function toPricing(value: unknown): Pricing | undefined {
  const p = value as { kind?: unknown; price?: unknown } | null;
  if (p?.kind === "fixed" && isPaise(p.price)) return { kind: "fixed", price: p.price as Pricing["price"] };
  return undefined;
}

function toItem(r: StoredRecord): MenuItem | undefined {
  if (!isText(r.name) || !isText(r.sortKey) || !isText(r.categoryId)) return undefined;
  if (typeof r.diet !== "string" || !DIETS.includes(r.diet)) return undefined;
  if (typeof r.prices !== "object" || r.prices === null) return undefined;

  const prices: MenuItem["prices"] = {};
  for (const [profileId, value] of Object.entries(r.prices)) {
    const pricing = toPricing(value);
    if (!pricing) return undefined;
    prices[profileId as ProfileId] = pricing;
  }
  return {
    id: r.id as ItemId,
    name: r.name,
    categoryId: r.categoryId as CategoryId,
    diet: r.diet as Diet,
    sortKey: r.sortKey,
    prices,
  };
}

function readAll<T>(rows: StoredRecord[], parse: (r: StoredRecord) => T | undefined, table: string): T[] {
  return rows.flatMap((row) => {
    if (row.deleted) return [];
    const parsed = parse(row);
    if (!parsed) console.warn(`Skipping malformed ${table} record`, row.id);
    return parsed ? [parsed] : [];
  });
}

async function readMenu(): Promise<MenuSnapshot> {
  const [profiles, categories, items] = await Promise.all([
    db.menuProfiles.toArray(),
    db.categories.toArray(),
    db.items.toArray(),
  ]);
  return {
    profiles: readAll(profiles, toProfile, "profile"),
    categories: readAll(categories, toCategory, "category"),
    items: readAll(items, toItem, "item"),
    // Shop overrides get their table with the first screen that writes one
    // (a second shop). Until then every shop sells the account menu as is.
    overrides: [],
  };
}

export const dexieMenuRepository: MenuRepository = {
  subscribe(onChange) {
    const subscription = liveQuery(readMenu).subscribe({
      next: onChange,
      error: (error) => console.error("Menu query failed", error),
    });
    return () => subscription.unsubscribe();
  },

  async write(changes: readonly MenuChange[]) {
    // Read outside the transaction: `meta` is not one of its tables.
    const tenantId = await getTenantId();
    const tables = [...new Set(changes.map((c) => db[TABLES[c.table]]))];

    await db.transaction("rw", [...tables, db.outbox], async () => {
      for (const change of changes) {
        const table = TABLES[change.table];
        // Merge over the stored row so sync metadata (createdAt) survives edits.
        const existing = await db[table].get(change.record.id);
        await save(table, {
          ...existing,
          ...change.record,
          tenantId,
          deleted: change.op === "remove",
        });
      }
    });
  },
};
