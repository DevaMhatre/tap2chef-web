// Contracts the use-case layer needs from the outside world. Infrastructure
// implements them; use cases never import Dexie or browser APIs directly.

import type { Category, ItemOverride, MenuItem, MenuProfile } from "../domain/menu";

export interface SyncRepository {
  /** Changes saved on this device and not yet pushed to the server. */
  pendingChanges(): Promise<number>;
  /** All records stored on this device, deleted ones included. */
  storedRecords(): Promise<number>;
}

export interface NetworkStatus {
  subscribe(onChange: () => void): () => void;
  isOnline(): boolean;
}

/** The current shop's menu: account catalog plus this shop's overrides. Deleted records excluded. */
export type MenuSnapshot = {
  profiles: MenuProfile[];
  categories: Category[];
  items: MenuItem[];
  overrides: ItemOverride[];
};

export type MenuRecord =
  | { table: "profiles"; record: MenuProfile }
  | { table: "categories"; record: Category }
  | { table: "items"; record: MenuItem };

// A removal carries the whole record, so undo is simply putting it back.
export type MenuChange = MenuRecord & { op: "put" | "remove" };

export interface MenuRepository {
  /** Emits the menu now, then after every change: this device, other tabs, sync. */
  subscribe(onChange: (menu: MenuSnapshot) => void): () => void;
  /** All changes land together or none do. */
  write(changes: readonly MenuChange[]): Promise<void>;
}

export interface IdGenerator {
  newId(): string;
}

export interface Ports {
  sync: SyncRepository;
  network: NetworkStatus;
  menu: MenuRepository;
  ids: IdGenerator;
}
