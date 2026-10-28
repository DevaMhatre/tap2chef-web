// In-memory ports for use-case tests. Not imported by the app.
import { applyChanges } from "./applyChanges";
import type { Clock, IdGenerator, MenuChange, MenuRepository, MenuSnapshot, OrderChange, OrderRepository, OrderSnapshot } from "./ports";

export function fakeIds(): IdGenerator {
  let next = 0;
  return { newId: () => `id-${++next}` };
}

export function fakeMenuRepository(initial: Partial<MenuSnapshot> = {}) {
  let menu: MenuSnapshot = { profiles: [], categories: [], items: [], overrides: [], ...initial };
  const listeners = new Set<(menu: MenuSnapshot) => void>();
  const writes: MenuChange[][] = [];
  let gate: Promise<void> | null = null;
  let failNext = false;

  const repository: MenuRepository = {
    subscribe(onChange) {
      listeners.add(onChange);
      // Like Dexie's liveQuery: the first value arrives asynchronously.
      queueMicrotask(() => onChange(menu));
      return () => listeners.delete(onChange);
    },
    async write(changes) {
      if (gate) await gate;
      if (failNext) {
        failNext = false;
        throw new Error("Storage is full");
      }
      writes.push([...changes]);
      menu = applyChanges(menu, changes);
      listeners.forEach((l) => l(menu));
    },
  };

  return {
    repository,
    writes,
    current: () => menu,
    /** Holds every write until the returned function is called. */
    hold(): () => void {
      let release!: () => void;
      gate = new Promise((resolve) => (release = resolve));
      return () => {
        gate = null;
        release();
      };
    },
    failNextWrite() {
      failNext = true;
    },
  };
}

/** A clock the test moves by hand. */
export function fakeClock(start: number) {
  let now = start;
  const clock: Clock = { now: () => now };
  return { clock, set: (at: number) => (now = at), advance: (ms: number) => (now += ms) };
}

export function fakeOrderRepository(initial: Partial<OrderSnapshot> = {}) {
  let snapshot: OrderSnapshot = { tables: [], orders: [], lines: [], payments: [], outOfStock: [], ...initial };
  const listeners = new Set<(snapshot: OrderSnapshot) => void>();
  const writes: OrderChange[][] = [];
  let gate: Promise<void> | null = null;

  const repository: OrderRepository = {
    subscribe(_since, onChange) {
      listeners.add(onChange);
      queueMicrotask(() => onChange(snapshot));
      return () => listeners.delete(onChange);
    },
    async write(changes) {
      if (gate) await gate;
      writes.push([...changes]);
      snapshot = applyChanges(snapshot, changes);
      listeners.forEach((l) => l(snapshot));
    },
  };

  return {
    repository,
    writes,
    current: () => snapshot,
    hold(): () => void {
      let release!: () => void;
      gate = new Promise((resolve) => (release = resolve));
      return () => {
        gate = null;
        release();
      };
    },
  };
}
