// In-memory ports for use-case tests. Not imported by the app.
import { applyChanges } from "./applyChanges";
import type { DeviceSession } from "../domain/signIn";
import { err, ok } from "../domain/result";
import type {
  AccountService,
  AppVisibility,
  NetworkStatus,
  SyncError,
  SyncService,
  Clock,
  DayRepository,
  DaySnapshot,
  DrawerChange,
  DrawerRepository,
  ExpenseChange,
  ExpenseRepository,
  ExpenseSnapshot,
  IdGenerator,
  MenuChange,
  MenuRepository,
  MenuSnapshot,
  OrderChange,
  OrderRepository,
  OrderSnapshot,
} from "./ports";

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

export function fakeExpenseRepository(initial: Partial<ExpenseSnapshot> = {}) {
  let snapshot: ExpenseSnapshot = { expenses: [], ...initial };
  const listeners = new Set<(snapshot: ExpenseSnapshot) => void>();
  const writes: ExpenseChange[][] = [];

  const repository: ExpenseRepository = {
    subscribe(_since, onChange) {
      listeners.add(onChange);
      queueMicrotask(() => onChange(snapshot));
      return () => listeners.delete(onChange);
    },
    async write(changes) {
      writes.push([...changes]);
      snapshot = applyChanges(snapshot, changes);
      listeners.forEach((l) => l(snapshot));
    },
  };

  return { repository, writes, current: () => snapshot };
}

/** A day's records the test sets; asked for another day, it answers an empty one. */
export function fakeDayRepository(days: Record<string, Partial<DaySnapshot>> = {}) {
  const asked: string[] = [];
  const repository: DayRepository = {
    subscribe(day, onChange) {
      asked.push(day);
      queueMicrotask(() => onChange({ orders: [], lines: [], payments: [], expenses: [], drawer: [], ...days[day] }));
      return () => undefined;
    },
  };
  return { repository, asked };
}

export function fakeDrawerRepository() {
  const writes: DrawerChange[][] = [];
  const repository: DrawerRepository = {
    async write(changes) {
      writes.push([...changes]);
    },
  };
  return { repository, writes };
}

/**
 * A server that knows one code. Every call is recorded; `hold()` keeps the
 * next sign-in waiting until `release()`, to test taps and unmounts mid-request.
 */
export function fakeAccountService({ code = "123456", knownEmails = [] as string[], offline = false } = {}) {
  let session: DeviceSession | null = null;
  const listeners = new Set<(s: DeviceSession | null) => void>();
  const calls = { requestCode: [] as string[], signIn: [] as { email: string; code: string; name?: string }[] };
  let gate: Promise<void> | undefined;
  let open = () => {};
  const state = { offline, tooSoon: 0, names: new Map<string, string>(knownEmails.map((e) => [e, "Sharma Dhaba"])) };

  const service: AccountService = {
    subscribe(onChange) {
      listeners.add(onChange);
      onChange(session);
      return () => listeners.delete(onChange);
    },
    async requestCode(email) {
      calls.requestCode.push(email);
      if (state.offline) return err({ kind: "offline" });
      if (state.tooSoon > 0) return err({ kind: "tooSoon", retryIn: state.tooSoon });
      return ok({ resendIn: 30 });
    },
    async signIn(email, typed, name, signal) {
      calls.signIn.push({ email, code: typed, name });
      if (gate) await gate;
      if (signal?.aborted) return err("failed");
      if (state.offline) return err("offline");
      if (typed !== code) return err("wrongCode");
      const known = state.names.get(email);
      if (!known && !name) return ok({ kind: "needsName" });
      session = { email, restaurantName: known ?? name! };
      listeners.forEach((l) => l(session));
      return ok({ kind: "signedIn", session });
    },
  };

  return {
    service,
    calls,
    state,
    hold() {
      gate = new Promise((resolve) => (open = resolve));
    },
    release() {
      gate = undefined;
      open();
    },
  };
}

/** A switch the test flips, for the network or the screen. */
export function fakeSwitch(initial = true) {
  let on = initial;
  const listeners = new Set<() => void>();
  const subscribe = (l: () => void) => {
    listeners.add(l);
    return () => listeners.delete(l);
  };
  return {
    network: { subscribe, isOnline: () => on } as NetworkStatus,
    visibility: { subscribe, isVisible: () => on } as AppVisibility,
    set(value: boolean) {
      on = value;
      listeners.forEach((l) => l());
    },
  };
}

/** Counts runs; `waiting` is what the outbox holds; `next` is what the next run answers. */
export function fakeSyncService() {
  let waiting = 0;
  const listeners = new Set<(n: number) => void>();
  const state = { runs: 0, next: undefined as SyncError | undefined, inFlight: 0, maxInFlight: 0, slow: 0 };
  const service: SyncService = {
    async run() {
      state.runs += 1;
      state.inFlight += 1;
      state.maxInFlight = Math.max(state.maxInFlight, state.inFlight);
      if (state.slow) await new Promise((r) => setTimeout(r, state.slow));
      state.inFlight -= 1;
      if (state.next) return err(state.next);
      setWaiting(0);
      return ok(undefined);
    },
    subscribeWaiting(onChange) {
      listeners.add(onChange);
      onChange(waiting);
      return () => listeners.delete(onChange);
    },
  };
  function setWaiting(n: number) {
    waiting = n;
    listeners.forEach((l) => l(n));
  }
  return { service, state, setWaiting };
}
