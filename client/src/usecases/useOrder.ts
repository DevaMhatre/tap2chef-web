import { useState } from "react";
import {
  matchesSearch,
  menuFor,
  type ItemId,
  type MenuProfile,
  type MenuSection,
  type OrderableItem,
  type ProfileId,
} from "../domain/menu";
import {
  activeOrderAt,
  activeOrders,
  businessDate,
  defaultProfile,
  nextToken,
  outOn,
  ticketOf,
  type Order,
  type OrderId,
  billOf,
  type BillError,
  type BillView,
  type PaymentError,
  type Ticket,
} from "../domain/order";
import { sortByOrder } from "../domain/ordering";
import { toRupeeText, type Paise } from "../domain/money";
import { err, ok, type Result } from "../domain/result";
import { amountPaid, quoteBill, type BillInput, type BillQuote } from "../domain/settlement";
import type { DiningTable, TableId } from "../domain/tables";
import type { CloseError, OrderCommands, Undo } from "./orderDesk";
import { usePorts } from "./PortsProvider";
import { labelOf, type OrderLabel } from "./useOrders";
import { useMenuSnapshot, useOrderDesk } from "./useOrderDesk";

export type OrderTarget = { kind: "table"; tableId: TableId } | { kind: "takeaway"; orderId: OrderId };

export type DishRow = OrderableItem & { out: boolean; inCart: number };

/** The screen's one primary action: send what's in the cart, hand over the bill, or take the money. */
export type NextStep = "send" | "bill" | "settle" | null;

export type Received = { settled: boolean; undo: Undo; change: Paise };

export type OrderScreen =
  | { state: "loading" }
  /** The table was removed, e.g. on another device. */
  | { state: "missing" }
  | { state: "noMenu" }
  /** A takeaway already paid: its token takes nothing more. */
  | { state: "settled"; label: OrderLabel; paid: Paise }
  | ({
      state: "ready";
      order: Order;
      label: OrderLabel;
      ticket: Ticket;
      /** Price lists to choose from: only before the first dish, and only if there are several. */
      profileChoice: { profiles: MenuProfile[]; chosen: ProfileId } | null;
      profileName: string;
      sections: MenuSection<DishRow>[];
      search(query: string): DishRow[];
      /** Every dish this order's list sells, for the out-today sheet. */
      dishes: DishRow[];
      /** Where this order could move: tables with nothing running. */
      freeTables: DiningTable[];
      chooseProfile(id: ProfileId): void;
      addDish(dish: OrderableItem): ReturnType<OrderCommands["addDish"]>;
      send(): Promise<number>;
      moveTo(tableId: TableId): ReturnType<OrderCommands["moveOrder"]>;
      /** The bill can close once nothing is waiting to go to the kitchen. */
      next: NextStep;
      /** What the table owes and has paid so far. */
      bill: BillView;
      presentBill(): Promise<Result<void, BillError>>;
      /** Where the bill sheet starts: a discount already agreed stays agreed. */
      billInput: BillInput;
      quote(input: BillInput): BillQuote;
      /**
       * Records the payment on the sheet; the one that leaves nothing settles.
       * `invalid`: what was typed doesn't make a payment yet; the quote says why.
       */
      receive(input: BillInput): Promise<Result<Received, PaymentError | "missing" | "invalid">>;
      /** Takes a wrong payment off this bill; it stays listed. */
      removePayment: OrderCommands["removePayment"];
      /** A bill with nothing left to pay. */
      closeBill(input: BillInput): Promise<Result<Undo, CloseError | "invalid">>;
    } & Pick<OrderCommands, "stepQuantity" | "setNote" | "removeLine" | "voidLine" | "setOutToday">);

export type ReadyOrder = Extract<OrderScreen, { state: "ready" }>;

export function useOrder(target: OrderTarget): OrderScreen {
  const { ids, clock } = usePorts();
  const { commands, snapshot } = useOrderDesk();
  const menu = useMenuSnapshot();
  // Fixed when the screen opens, so a double tap on the first dish can't
  // create two orders.
  const [pendingId] = useState(() => (target.kind === "takeaway" ? target.orderId : (ids.newId() as OrderId)));
  const [chosenProfile, setChosenProfile] = useState<ProfileId | null>(null);

  if (!snapshot || !menu) return { state: "loading" };
  if (target.kind === "table" && !snapshot.tables.some((t) => t.id === target.tableId)) return { state: "missing" };
  if (target.kind === "takeaway") {
    const paid = snapshot.orders.find((o) => o.id === target.orderId);
    if (paid?.state.status === "settled") {
      const own = snapshot.payments.filter((p) => p.orderId === paid.id);
      return { state: "settled", label: labelOf({ order: paid }, snapshot.tables), paid: amountPaid(own) };
    }
  }
  if (menu.profiles.length === 0 || menu.items.length === 0) return { state: "noMenu" };

  const active = activeOrders(snapshot.orders, snapshot.lines, snapshot.payments);
  const running =
    target.kind === "table" ? activeOrderAt(target.tableId, active) : active.find((a) => a.order.id === target.orderId);
  const lines = running?.lines ?? [];
  const now = clock.now();
  const today = businessDate(now);
  const profiles = sortByOrder(menu.profiles);
  const channelType = target.kind === "table" ? "dineIn" : "takeaway";
  const fallback = defaultProfile(channelType, profiles)!;

  // A stored order keeps its list; one whose list was deleted on another
  // device keeps its lines' prices and prices new dishes from the default.
  const stored = running?.order;
  const pickedProfile = profiles.some((p) => p.id === chosenProfile) ? chosenProfile! : fallback;
  const profileId = stored
    ? profiles.some((p) => p.id === stored.profileId)
      ? stored.profileId
      : fallback
    : pickedProfile;

  const order: Order = stored ?? {
    id: pendingId,
    channel:
      target.kind === "table"
        ? { type: "dineIn", tableId: target.tableId }
        : { type: "takeaway", token: nextToken(snapshot.orders, today) },
    profileId,
    businessDate: today,
    openedAt: now,
    state: { status: "open" },
  };

  const out = outOn(snapshot.outOfStock, today);
  const inCart = new Map<ItemId, number>();
  for (const line of lines) {
    if (line.state.status === "draft") inCart.set(line.itemId, (inCart.get(line.itemId) ?? 0) + line.quantity);
  }
  const sections = menuFor(profileId, menu.categories, menu.items, menu.overrides).map((section) => ({
    ...section,
    items: section.items.map((dish) => ({ ...dish, out: out.has(dish.item.id), inCart: inCart.get(dish.item.id) ?? 0 })),
  }));
  const dishes = sections.flatMap((s) => s.items);
  const ticket = ticketOf(lines);
  const bill = running?.bill ?? billOf(order, [], []);
  const quote = (input: BillInput) => quoteBill(bill.subtotal, bill.paid, input);
  const status = order.state.status;
  const next: NextStep =
    ticket.draft.length > 0 ? "send" : status === "billed" ? "settle" : status === "open" && ticket.rounds.length > 0 ? "bill" : null;
  const busy = new Set(active.flatMap((a) => (a.order.channel.type === "dineIn" ? [a.order.channel.tableId] : [])));

  return {
    state: "ready",
    order,
    label: labelOf({ order }, snapshot.tables),
    ticket,
    profileChoice: !stored && profiles.length > 1 ? { profiles, chosen: profileId } : null,
    profileName: profiles.find((p) => p.id === profileId)?.name ?? "",
    sections,
    search: (query) => dishes.filter((d) => matchesSearch(d.item.name, query)),
    dishes,
    freeTables: sortByOrder(snapshot.tables).filter((t) => !busy.has(t.id)),
    chooseProfile: setChosenProfile,
    addDish: (dish) => commands.addDish({ ...order, profileId }, dish),
    send: () => commands.send(order.id),
    moveTo: (tableId) => commands.moveOrder(order.id, tableId),
    stepQuantity: commands.stepQuantity,
    setNote: commands.setNote,
    removeLine: commands.removeLine,
    voidLine: commands.voidLine,
    setOutToday: commands.setOutToday,
    next,
    bill,
    presentBill: () => commands.presentBill(order.id),
    removePayment: commands.removePayment,
    billInput: {
      finalAmount: bill.discount ? toRupeeText(bill.due) : "",
      reason: bill.discount?.reason ?? "",
      method: null,
      received: "",
    },
    quote,
    async receive(input) {
      // Quoted from the bill on screen; the desk checks it against what is
      // stored, so a dish or payment added on another tab makes it refuse.
      const q = quote(input);
      if (!q.discount.ok || input.method === null || !q.receipt?.ok) return err("invalid");
      const { amount, change } = q.receipt.value;
      const result = await commands.receive(order.id, { method: input.method }, amount, q.discount.value);
      return result.ok ? ok({ ...result.value, change }) : result;
    },
    closeBill(input) {
      const q = quote(input);
      if (!q.discount.ok) return Promise.resolve(err("invalid"));
      return commands.closeBill(order.id, q.discount.value);
    },
  };
}
