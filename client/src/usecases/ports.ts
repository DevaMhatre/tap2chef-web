// Contracts the use-case layer needs from the outside world. Infrastructure
// implements them; use cases never import Dexie or browser APIs directly.

import type { Category, ItemOverride, MenuItem, MenuProfile } from "../domain/menu";
import type { PhonePerson } from "../domain/access";
import type { DrawerEntry } from "../domain/drawer";
import type { Phone } from "../domain/phones";
import type { Repayment } from "../domain/dues";
import type { Kot } from "../domain/kot";
import type { Expense } from "../domain/expense";
import type { BusinessDate, Order, OrderLine, OutOfStock, Payment } from "../domain/order";
import type { SetupProgress, ShopDetails } from "../domain/setup";
import type { DeviceSession, Email } from "../domain/signIn";
import type { Result } from "../domain/result";
import type { DiningTable } from "../domain/tables";

export type SyncError = "offline" | "signedOut" | "failed";

/**
 * A change the account would not take from this phone (not allowed here). It
 * is shown, never silently dropped; what the account holds comes back.
 */
export type Refused = { table: string; recordId: string; at: number };

/** Sending this device's changes to the account and bringing everyone else's. */
export interface SyncService {
  /** Emits the changes refused since they were last seen, now and on every change. */
  subscribeRefused(onChange: (refused: Refused[]) => void): () => void;
  /** Seen: the notice goes. */
  dismissRefused(): Promise<void>;
  /** Pushes what waits here, then pulls what changed elsewhere. Signed out, refuses at once. */
  run(signal?: AbortSignal): Promise<Result<void, SyncError>>;
  /** Emits how many changes wait to be sent, now and after every change. */
  subscribeWaiting(onChange: (count: number) => void): () => void;
}

export interface NetworkStatus {
  subscribe(onChange: () => void): () => void;
  isOnline(): boolean;
}

/** Whether the app is on screen: a phone in a pocket shouldn't pull every few seconds. */
export interface AppVisibility {
  subscribe(onChange: () => void): () => void;
  isVisible(): boolean;
}

/** The current shop's menu: its brand's catalog plus this shop's overrides. Deleted records excluded. */
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

/** The shop's service: its tables, open orders and what is out today. Deleted records excluded. */
export type OrderSnapshot = {
  tables: DiningTable[];
  /** Open orders, whichever day they began, so one left open is never lost. */
  orders: Order[];
  lines: OrderLine[];
  /** Money received against the orders above. */
  payments: Payment[];
  outOfStock: OutOfStock[];
};

export type OrderRecord =
  | { table: "tables"; record: DiningTable }
  | { table: "orders"; record: Order }
  | { table: "lines"; record: OrderLine }
  | { table: "payments"; record: Payment }
  | { table: "outOfStock"; record: OutOfStock };

export type OrderChange = OrderRecord & { op: "put" | "remove" };

export interface OrderRepository {
  /**
   * Emits now, then after every change. Out-of-stock records from before
   * `since` are left out; they no longer apply.
   */
  subscribe(since: BusinessDate, onChange: (snapshot: OrderSnapshot) => void): () => void;
  /** All changes land together or none do. */
  write(changes: readonly OrderChange[]): Promise<void>;
}

/** Money that went out, from `since` on. Deleted records excluded. */
export type ExpenseSnapshot = { expenses: Expense[] };

export type ExpenseChange = { table: "expenses"; record: Expense; op: "put" | "remove" };

export interface ExpenseRepository {
  /** Emits now, then after every change: this device, other tabs, sync. */
  subscribe(since: BusinessDate, onChange: (snapshot: ExpenseSnapshot) => void): () => void;
  /** All changes land together or none do. */
  write(changes: readonly ExpenseChange[]): Promise<void>;
}

/** Everything one trading day is made of, to read its numbers. Read-only. */
export type DaySnapshot = {
  /** Every order that belongs to the day, paid or not. */
  orders: Order[];
  lines: OrderLine[];
  payments: Payment[];
  expenses: Expense[];
  /** What the cash box started with and held, for this day and the day before (which carries in). */
  drawer: DrawerEntry[];
  /** Money regulars brought back on this day. */
  repayments: Repayment[];
};

/** Every bill on a regular's name, and everything paid back, all time. */
export type DuesSnapshot = { later: Payment[]; repayments: Repayment[] };

export type RepaymentChange = { table: "repayments"; record: Repayment; op: "put" | "remove" };

export interface DuesRepository {
  subscribe(onChange: (snapshot: DuesSnapshot) => void): () => void;
  write(changes: readonly RepaymentChange[]): Promise<void>;
}

export interface DayRepository {
  subscribe(day: BusinessDate, onChange: (snapshot: DaySnapshot) => void): () => void;
}

export type DrawerChange = { table: "drawer"; record: DrawerEntry; op: "put" | "remove" };

export interface DrawerRepository {
  /** Stating the same kind for the same day again replaces it. */
  write(changes: readonly DrawerChange[]): Promise<void>;
}

export type CodeRequestError = { kind: "offline" } | { kind: "tooSoon"; retryIn: number } | { kind: "failed" };
export type SignInError = "offline" | "wrongCode" | "expired" | "tooManyTries" | "noAccess" | "failed";
export type SignInOutcome = { kind: "signedIn"; session: DeviceSession } | { kind: "needsName" };

/**
 * Signing this device in to the owner's account. Needs the internet; nothing
 * else in the app waits on it. Which account and shop the device's records
 * belong to is the adapter's business, never the caller's.
 */
export interface AccountService {
  /** Emits now (null when not signed in), then after every change. */
  subscribe(onChange: (session: DeviceSession | null) => void): () => void;
  requestCode(email: Email, signal?: AbortSignal): Promise<Result<{ resendIn: number }, CodeRequestError>>;
  /** A new owner is asked for the restaurant's name, then calls again with it. */
  signIn(
    email: Email,
    code: string,
    restaurantName: string | undefined,
    signal?: AbortSignal,
  ): Promise<Result<SignInOutcome, SignInError>>;
  /** Whose restaurant a code would add this phone to, without using the code. */
  previewJoin(code: string, signal?: AbortSignal): Promise<Result<{ restaurantName: string }, JoinError>>;
  /** Uses the code: this phone joins the restaurant and works in it at once. */
  join(code: string, signal?: AbortSignal): Promise<Result<DeviceSession, JoinError>>;
}

export type JoinError = "offline" | "wrongCode" | "failed";

export type PhonesError = "offline" | "notOwnerPhone" | "failed";

/** The owner's phone adding and removing the restaurant's phones. Needs the internet. */
export interface PhonesService {
  /** A fresh 6-digit code for a phone that will join as `person`; any earlier code stops working. */
  linkCode(person: PhonePerson, signal?: AbortSignal): Promise<Result<{ code: string; expiresAt: number }, PhonesError>>;
  list(signal?: AbortSignal): Promise<Result<Phone[], PhonesError>>;
  /** Signs a phone out for good; it clears the restaurant from itself. */
  remove(id: string, signal?: AbortSignal): Promise<Result<void, PhonesError>>;
}

/** The restaurant as its owner described it, on every phone of the shop. */
export interface ShopRepository {
  /** Emits now (null until the setup's answers are in), then after every change. */
  subscribe(onChange: (details: ShopDetails | null) => void): () => void;
  write(details: ShopDetails): Promise<void>;
}

/** What only this phone remembers about its setup. */
export type LocalSetup = {
  /** Null until the setup was first looked at on this phone. */
  progress: SetupProgress | null;
  /** The one-time "keep a copy safe" card was put away. */
  cardDismissed: boolean;
};

export interface SetupStore {
  subscribe(onChange: (setup: LocalSetup) => void): () => void;
  save(progress: SetupProgress): Promise<void>;
  /** Saves only if nothing is saved yet, so two tabs opening together agree. */
  begin(progress: SetupProgress): Promise<void>;
  /** Whether this phone holds nothing yet: no records, never signed in. */
  isEmptyDevice(): Promise<boolean>;
  dismissCard(): Promise<void>;
}

/** Prints a KOT. Today the phone's print dialog; Bluetooth or USB once the printer check says which (9b). */
export interface KitchenPrinter {
  print(kot: Kot): Promise<Result<void, "failed">>;
}

/** The two ways a web app can reach a receipt printer from a phone. */
export type PrinterRoute = "bluetooth" | "usb";

export type PrinterTry =
  /** This browser can't use that route at all (not Chrome on Android, say). */
  | { outcome: "unsupported" }
  /** Nothing was picked: the printer wasn't in the list, or the list was closed. */
  | { outcome: "cancelled" }
  | { outcome: "printed"; name: string; detail: string }
  | { outcome: "failed"; name?: string; detail: string };

/** Trying a printer by one route: find it, and print a test KOT. */
export interface PrinterCheck {
  tryPrint(route: PrinterRoute): Promise<PrinterTry>;
}

export interface Clock {
  now(): number;
}

export interface IdGenerator {
  newId(): string;
}

export interface Ports {
  sync: SyncService;
  network: NetworkStatus;
  visibility: AppVisibility;
  menu: MenuRepository;
  orders: OrderRepository;
  expenses: ExpenseRepository;
  days: DayRepository;
  dues: DuesRepository;
  drawer: DrawerRepository;
  account: AccountService;
  phones: PhonesService;
  printer: PrinterCheck;
  kitchen: KitchenPrinter;
  shop: ShopRepository;
  setup: SetupStore;
  ids: IdGenerator;
  clock: Clock;
}
