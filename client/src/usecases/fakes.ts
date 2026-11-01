// In-memory ports for use-case tests. Not imported by the app.
import { applyChanges } from "./applyChanges";
import type { PhonePerson } from "../domain/access";
import type { Phone } from "../domain/phones";
import type { SetupProgress, ShopDetails } from "../domain/setup";
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
  DuesRepository,
  DuesSnapshot,
  RepaymentChange,
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
  LocalSetup,
  SetupStore,
  ShopRepository,
  PhonesService,
  Refused,
  KitchenPrinter,
} from "./ports";
import type { Kot } from "../domain/kot";

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

export function fakeDuesRepository(initial: Partial<DuesSnapshot> = {}) {
  let snapshot: DuesSnapshot = { later: [], repayments: [], ...initial };
  const listeners = new Set<(snapshot: DuesSnapshot) => void>();
  const writes: RepaymentChange[][] = [];
  const repository: DuesRepository = {
    subscribe(onChange) {
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
      queueMicrotask(() => onChange({ orders: [], lines: [], payments: [], expenses: [], drawer: [], repayments: [], ...days[day] }));
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
  const calls = { requestCode: [] as string[], signIn: [] as { email: string; code: string; name?: string }[], join: [] as string[] };
  let gate: Promise<void> | undefined;
  let open = () => {};
  const state = {
    offline,
    tooSoon: 0,
    names: new Map<string, string>(knownEmails.map((e) => [e, "Sharma Dhaba"])),
    /** Live codes on some owner's phone, and the restaurant each adds a phone to. */
    joinCodes: new Map<string, string>([["482913", "Sharma Dhaba"]]),
  };

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
      session = { via: "email", email, restaurantName: known ?? name! };
      listeners.forEach((l) => l(session));
      return ok({ kind: "signedIn", session });
    },
    async previewJoin(code) {
      if (state.offline) return err("offline");
      return state.joinCodes.has(code) ? ok({ restaurantName: state.joinCodes.get(code)! }) : err("wrongCode");
    },
    async join(code) {
      calls.join.push(code);
      if (gate) await gate;
      if (state.offline) return err("offline");
      const restaurantName = state.joinCodes.get(code);
      if (!restaurantName) return err("wrongCode");
      state.joinCodes.delete(code);
      session = { via: "link", restaurantName };
      listeners.forEach((l) => l(session));
      return ok(session);
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
  let refused: Refused[] = [];
  const listeners = new Set<(n: number) => void>();
  const refusedListeners = new Set<(r: Refused[]) => void>();
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
    subscribeRefused(onChange) {
      refusedListeners.add(onChange);
      onChange(refused);
      return () => refusedListeners.delete(onChange);
    },
    async dismissRefused() {
      setRefused([]);
    },
  };
  function setRefused(next: Refused[]) {
    refused = next;
    refusedListeners.forEach((l) => l(next));
  }
  function setWaiting(n: number) {
    waiting = n;
    listeners.forEach((l) => l(n));
  }
  return { service, state, setWaiting, setRefused };
}

/** The shop's details; `writes` records every save. */
export function fakeShopRepository(initial: ShopDetails | null = null) {
  let details = initial;
  const listeners = new Set<(d: ShopDetails | null) => void>();
  const writes: ShopDetails[] = [];
  const repository: ShopRepository = {
    subscribe(onChange) {
      listeners.add(onChange);
      queueMicrotask(() => onChange(details));
      return () => listeners.delete(onChange);
    },
    async write(next) {
      writes.push(next);
      details = next;
      listeners.forEach((l) => l(details));
    },
  };
  return { repository, writes };
}

/** This phone's setup memory. `empty` says whether the phone holds nothing yet. */
export function fakeSetupStore({ progress = null as SetupProgress | null, empty = true } = {}) {
  let local: LocalSetup = { progress, cardDismissed: false };
  const listeners = new Set<(s: LocalSetup) => void>();
  const set = (next: LocalSetup) => {
    local = next;
    listeners.forEach((l) => l(local));
  };
  const state = { empty };
  const store: SetupStore = {
    subscribe(onChange) {
      listeners.add(onChange);
      queueMicrotask(() => onChange(local));
      return () => listeners.delete(onChange);
    },
    async save(next) {
      set({ ...local, progress: next });
    },
    async begin(next) {
      if (!local.progress) set({ ...local, progress: next });
    },
    async isEmptyDevice() {
      return state.empty;
    },
    async dismissCard() {
      set({ ...local, cardDismissed: true });
    },
  };
  return { store, state, current: () => local };
}

/** The server's list of phones, a code at a time. `offline` makes every call fail as offline. */
export function fakePhonesService(phones: Phone[] = [], now: () => number = Date.now) {
  const state = { phones: [...phones], offline: false, codes: 0, people: [] as PhonePerson[] };
  const service: PhonesService = {
    async linkCode(person) {
      if (state.offline) return err("offline");
      state.codes += 1;
      state.people.push(person);
      return ok({ code: String(100000 + state.codes), expiresAt: now() + 10 * 60 * 1000 });
    },
    async list() {
      return state.offline ? err("offline") : ok([...state.phones]);
    },
    async remove(id) {
      if (state.offline) return err("offline");
      state.phones = state.phones.filter((p) => p.id !== id);
      return ok(undefined);
    },
  };
  return { service, state };
}

/** Keeps every slip it is asked to print. */
export function fakeKitchenPrinter() {
  const printed: Kot[] = [];
  const printer: KitchenPrinter = {
    async print(kot) {
      printed.push(kot);
      return ok(undefined);
    },
  };
  return { printer, printed };
}
