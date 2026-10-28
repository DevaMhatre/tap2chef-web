// Contracts the use-case layer needs from the outside world. Infrastructure
// implements them; use cases never import Dexie or browser APIs directly.

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

export interface Ports {
  sync: SyncRepository;
  network: NetworkStatus;
}
