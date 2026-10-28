import {
  NAME_MAX,
  validateItemDraft,
  validateName,
  type Category,
  type CategoryId,
  type Diet,
  type ItemDraft,
  type ItemDraftErrors,
  type ItemId,
  type MenuItem,
  type MenuProfile,
  type NameError,
  type ProfileId,
} from "../domain/menu";
import { placeAt, sortByOrder, type Ordered } from "../domain/ordering";
import { err, ok, type Result } from "../domain/result";
import { applyChanges } from "./menuChanges";
import type { IdGenerator, MenuChange, MenuRecord, MenuRepository, MenuSnapshot } from "./ports";

export type Undo = () => Promise<void>;

export type MenuCommands = {
  /** Creates the first profile. Does nothing if a menu already exists. */
  createMenu(): Promise<void>;
  /** A fresh draft whose id is fixed now, so saving it twice can't create two items. */
  newItem(): { id: ItemId; draft: ItemDraft };
  saveItem(id: ItemId, draft: ItemDraft): Promise<Result<MenuItem, ItemDraftErrors>>;
  removeItem(id: ItemId): Promise<Undo>;
  moveItem(id: ItemId, categoryId: CategoryId, toIndex: number): Promise<void>;
  addCategory(name: string): Promise<Result<Category, NameError>>;
  renameCategory(id: CategoryId, name: string): Promise<Result<Category, NameError>>;
  /** Removes the category and its items together; undo restores both. */
  removeCategory(id: CategoryId): Promise<Undo>;
  moveCategory(id: CategoryId, toIndex: number): Promise<void>;
  addProfile(name: string): Promise<Result<MenuProfile, NameError>>;
  renameProfile(id: ProfileId, name: string): Promise<Result<MenuProfile, NameError>>;
  moveProfile(id: ProfileId, toIndex: number): Promise<void>;
  removeProfile(id: ProfileId): Promise<Result<Undo, "lastProfile">>;
};

export type MenuEditor = {
  subscribe(onChange: (menu: MenuSnapshot) => void): () => void;
  commands: MenuCommands;
};

export const FIRST_PROFILE_NAME = "Dine-In";

type Plan<T> = { changes: MenuChange[]; result: T };
const nothing = <T>(result: T): Plan<T> => ({ changes: [], result });

// placeAt's sort-key changes as records to write. Usually just the moved
// record; a tie among siblings re-keys them too.
function placed<T extends Ordered>(
  table: MenuRecord["table"],
  siblings: readonly T[],
  record: T,
  toIndex: number,
): MenuChange[] {
  return placeAt(siblings, record.id, toIndex).map(({ id, sortKey }) => {
    const base = id === record.id ? record : siblings.find((s) => s.id === id)!;
    return { op: "put", table, record: { ...base, sortKey } } as unknown as MenuChange;
  });
}

const savedRecord = <T>(changes: MenuChange[], id: string): T =>
  changes.find((c) => c.record.id === id)!.record as T;

// The menu builder's rules and write discipline, free of React so it would
// survive a rewrite of the UI.
export function createMenuEditor(repository: MenuRepository, ids: IdGenerator): MenuEditor {
  // What commands plan against: the repository's view plus any writes it
  // hasn't emitted yet.
  let latest: MenuSnapshot | null = null;
  let queue: Promise<unknown> = Promise.resolve();
  const inFlight = new Map<string, Promise<unknown>>();
  let lastUsed: { categoryId?: CategoryId; diet?: Diet } = {};

  // Writes run one at a time, each planned against the result of the one
  // before, so fast bulk entry never plans two items from the same stale
  // menu. A repeated command (double tap) gets the pending promise instead
  // of running twice.
  function run<T>(key: string, plan: (menu: MenuSnapshot) => Plan<T>): Promise<T> {
    const pending = inFlight.get(key);
    if (pending) return pending as Promise<T>;

    const task = queue.then(async () => {
      if (!latest) throw new Error("Menu is not loaded yet");
      const { changes, result } = plan(latest);
      if (changes.length > 0) {
        await repository.write(changes);
        latest = applyChanges(latest, changes);
      }
      return result;
    });
    const settled = task.finally(() => inFlight.delete(key));
    inFlight.set(key, settled);
    queue = settled.catch(() => undefined);
    return settled;
  }

  // Removals are soft, so undo writes the removed records back as they were.
  const undoOf =
    (changes: MenuChange[]): Undo =>
    () =>
      run(`undo:${changes.map((c) => c.record.id).join(",")}`, () => ({
        changes: changes.map((c) => ({ ...c, op: "put" })),
        result: undefined,
      }));

  function named<T extends MenuProfile | Category>(
    table: "profiles" | "categories",
    max: number,
    list: (menu: MenuSnapshot) => T[],
  ) {
    return {
      add(name: string): Promise<Result<T, NameError>> {
        const valid = validateName(name, max);
        if (!valid.ok) return Promise.resolve(err(valid.error));
        return run<Result<T, NameError>>(`add:${table}:${valid.value}`, (menu) => {
          const record = { id: ids.newId(), name: valid.value, sortKey: "" } as T;
          const changes = placed(table, list(menu), record, Infinity);
          return { changes, result: ok(savedRecord<T>(changes, record.id)) };
        });
      },
      rename(id: T["id"], name: string): Promise<Result<T, NameError>> {
        const valid = validateName(name, max);
        if (!valid.ok) return Promise.resolve(err(valid.error));
        return run<Result<T, NameError>>(`rename:${id}`, (menu) => {
          const current = list(menu).find((r) => r.id === id);
          if (!current) throw new Error(`Nothing to rename: ${id}`);
          const record = { ...current, name: valid.value };
          return { changes: [{ op: "put", table, record } as MenuChange], result: ok(record) };
        });
      },
      move(id: T["id"], toIndex: number): Promise<void> {
        return run(`move:${id}`, (menu) => {
          const current = list(menu).find((r) => r.id === id);
          return current ? { changes: placed(table, list(menu), current, toIndex), result: undefined } : nothing(undefined);
        });
      },
    };
  }

  const profiles = named("profiles", NAME_MAX.profile, (m) => m.profiles);
  const categories = named("categories", NAME_MAX.category, (m) => m.categories);
  const itemsIn = (menu: MenuSnapshot, categoryId: CategoryId, exceptId?: ItemId) =>
    menu.items.filter((i) => i.categoryId === categoryId && i.id !== exceptId);

  const commands: MenuCommands = {
    createMenu: () =>
      run("createMenu", (menu) => {
        if (menu.profiles.length > 0) return nothing(undefined);
        const record: MenuProfile = { id: ids.newId() as ProfileId, name: FIRST_PROFILE_NAME, sortKey: "" };
        return { changes: placed("profiles", [], record, 0), result: undefined };
      }),

    newItem() {
      const sortedCategories = sortByOrder(latest?.categories ?? []);
      const remembered = sortedCategories.find((c) => c.id === lastUsed.categoryId);
      return {
        id: ids.newId() as ItemId,
        draft: {
          name: "",
          categoryId: (remembered ?? sortedCategories[0])?.id ?? null,
          diet: lastUsed.diet ?? null,
          prices: Object.fromEntries((latest?.profiles ?? []).map((p) => [p.id, ""])),
        },
      };
    },

    saveItem(id, draft) {
      const valid = validateItemDraft(draft);
      if (!valid.ok) return Promise.resolve(err(valid.error));
      const fields = valid.value;
      lastUsed = { categoryId: fields.categoryId, diet: fields.diet };

      return run<Result<MenuItem, ItemDraftErrors>>(`saveItem:${id}`, (menu) => {
        // The category may have been deleted on another device meanwhile.
        if (!menu.categories.some((c) => c.id === fields.categoryId)) {
          return nothing(err({ category: "required" }));
        }
        const existing = menu.items.find((i) => i.id === id);
        const record: MenuItem = { ...fields, id, sortKey: existing?.sortKey ?? "" };

        // An edit within its category keeps its place; a new item, or one
        // moved to another category, goes to the end of that category.
        const changes: MenuChange[] =
          existing && existing.categoryId === fields.categoryId
            ? [{ op: "put", table: "items", record }]
            : placed("items", itemsIn(menu, fields.categoryId, id), record, Infinity);
        return { changes, result: ok(savedRecord<MenuItem>(changes, id)) };
      });
    },

    removeItem: (id) =>
      run(`removeItem:${id}`, (menu) => {
        const item = menu.items.find((i) => i.id === id);
        const changes: MenuChange[] = item ? [{ op: "remove", table: "items", record: item }] : [];
        return { changes, result: undoOf(changes) };
      }),

    moveItem: (id, categoryId, toIndex) =>
      run(`moveItem:${id}`, (menu) => {
        const item = menu.items.find((i) => i.id === id);
        if (!item) return nothing(undefined);
        return { changes: placed("items", itemsIn(menu, categoryId, id), { ...item, categoryId }, toIndex), result: undefined };
      }),

    addCategory: categories.add,
    renameCategory: categories.rename,
    moveCategory: categories.move,

    removeCategory: (id) =>
      run(`removeCategory:${id}`, (menu) => {
        const category = menu.categories.find((c) => c.id === id);
        const changes: MenuChange[] = category
          ? [
              ...itemsIn(menu, id).map((record): MenuChange => ({ op: "remove", table: "items", record })),
              { op: "remove", table: "categories", record: category },
            ]
          : [];
        return { changes, result: undoOf(changes) };
      }),

    addProfile: profiles.add,
    renameProfile: profiles.rename,
    moveProfile: profiles.move,

    removeProfile: (id) =>
      run<Result<Undo, "lastProfile">>(`removeProfile:${id}`, (menu) => {
        const profile = menu.profiles.find((p) => p.id === id);
        if (!profile) return nothing(ok(() => Promise.resolve()));
        // Every order needs a price list to price against.
        if (menu.profiles.length === 1) return nothing(err("lastProfile"));
        const changes: MenuChange[] = [{ op: "remove", table: "profiles", record: profile }];
        return { changes, result: ok(undoOf(changes)) };
      }),
  };

  return {
    subscribe: (onChange) =>
      repository.subscribe((menu) => {
        latest = menu;
        onChange(menu);
      }),
    commands,
  };
}
