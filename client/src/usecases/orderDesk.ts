import { validateName, type ItemId, type NameError, type OrderableItem } from "../domain/menu";
import { keyBetween, placeAt } from "../domain/ordering";
import {
  activeOrderAt,
  activeOrders,
  addToDraft,
  businessDate,
  correctPayments,
  nextToken,
  outOfStockId,
  outOn,
  sendDraft,
  settle as settleOrder,
  voidSent,
  withNote,
  withQuantity,
  type CorrectionError,
  type LineEditError,
  type LineId,
  type Order,
  type OrderId,
  type OrderLine,
  type RoundId,
  type SettleError,
  type VoidReason,
} from "../domain/order";
import { err, ok, type Result } from "../domain/result";
import type { Discount, Payment } from "../domain/settlement";
import { isTableCount, nextTableName, numberedTables, TABLE_NAME_MAX, type DiningTable, type TableId } from "../domain/tables";
import { applyChanges } from "./applyChanges";
import type { Undo } from "./menuEditor";
import type { Clock, IdGenerator, OrderChange, OrderRepository, OrderSnapshot } from "./ports";
import { createSerialWriter, type Plan as SerialPlan } from "./serialWriter";

export type { Undo };

type Plan<T> = SerialPlan<OrderChange, T>;
const nothing = <T>(result: T): Plan<T> => ({ changes: [], result });
const put = (change: Omit<OrderChange, "op">): OrderChange => ({ ...change, op: "put" }) as OrderChange;
const remove = (change: Omit<OrderChange, "op">): OrderChange => ({ ...change, op: "remove" }) as OrderChange;

export type OrderCommands = {
  /** "How many tables?" Does nothing once the shop has tables. */
  setUpTables(count: number): Promise<Result<void, "invalidCount">>;
  addTable(): Promise<DiningTable>;
  renameTable(id: TableId, name: string): Promise<Result<DiningTable, NameError>>;
  /** A table with an order running can't go; its order would lose its place. */
  removeTable(id: TableId): Promise<Result<Undo, "occupied">>;

  /**
   * One more of a dish. `order` may not be stored yet: the first dish stores
   * it, so a table tapped and left leaves nothing behind.
   */
  addDish(order: Order, dish: OrderableItem): Promise<Result<OrderLine, "outToday" | "settled">>;
  /**
   * One more or one fewer, planned against the stored quantity so fast taps
   * all count. Below 1 removes the line, with undo.
   */
  stepQuantity(lineId: LineId, by: 1 | -1): Promise<Result<Undo | null, LineEditError>>;
  setNote(lineId: LineId, note: string): Promise<Result<OrderLine, LineEditError>>;
  removeLine(lineId: LineId): Promise<Result<Undo, LineEditError>>;
  /** Sends every draft line as one round. Resolves with how many lines went. */
  send(orderId: OrderId): Promise<number>;
  /** Cancels a sent dish. "Out of stock" also marks it out for today. */
  voidLine(lineId: LineId, quantity: number, reason?: VoidReason): Promise<Result<Undo, LineEditError>>;
  moveOrder(orderId: OrderId, tableId: TableId): Promise<Result<void, "occupied">>;
  setOutToday(itemId: ItemId, out: boolean): Promise<void>;

  /** Closes the bill and frees the table. Undo reopens it, unless the table has been taken since. */
  settle(orderId: OrderId, payments: Payment[], discount?: Discount): Promise<Result<Undo, SettleError>>;
  /** "It was UPI, not cash." Same amount, other method. */
  correctPayments(orderId: OrderId, payments: Payment[]): Promise<Result<void, CorrectionError>>;
};

export type OrderDesk = {
  subscribe(onChange: (snapshot: OrderSnapshot) => void): () => void;
  commands: OrderCommands;
};

// The service's rules and write discipline, free of React.
export function createOrderDesk(repository: OrderRepository, ids: IdGenerator, clock: Clock): OrderDesk {
  const writer = createSerialWriter<OrderSnapshot, OrderChange>((changes) => repository.write(changes), applyChanges);
  const { run } = writer;
  const today = () => businessDate(clock.now());

  // Removals are soft and edits keep the record whole, so undo puts back
  // what was there and removes what was added.
  const undoOf =
    (before: OrderChange[], added: OrderChange[] = []): Undo =>
    () =>
      run(`undo:${[...before, ...added].map((c) => c.record.id).join(",")}`, () => ({
        changes: [...before.map((c) => ({ ...c, op: "put" as const })), ...added.map((c) => ({ ...c, op: "remove" as const }))],
        result: undefined,
      }));

  const lineIn = (s: OrderSnapshot, id: LineId) => s.lines.find((l) => l.id === id);
  const orderIn = (s: OrderSnapshot, id: OrderId) => s.orders.find((o) => o.id === id);
  const isSettled = (s: OrderSnapshot, id: OrderId) => orderIn(s, id)?.state.status === "settled";

  // Back to open, the way it was. Not if it was settled again or corrected
  // since, nor if a new order already took its table.
  const reopen =
    (orderId: OrderId, settledAt: number): Undo =>
    () =>
      run(`reopen:${orderId}`, (s) => {
        const current = orderIn(s, orderId);
        const { state } = current ?? {};
        if (!current || state?.status !== "settled" || state.settledAt !== settledAt || state.correctedAt) return nothing(undefined);
        const { channel } = current;
        if (channel.type === "dineIn" && activeOrderAt(channel.tableId, activeOrders(s.orders, s.lines))) return nothing(undefined);
        return { changes: [put({ table: "orders", record: { ...current, state: { status: "open" } } })], result: undefined };
      });

  function editLine<T>(
    key: string | null,
    lineId: LineId,
    edit: (line: OrderLine, s: OrderSnapshot) => Plan<Result<T, LineEditError>>,
  ): Promise<Result<T, LineEditError>> {
    return run(key, (s) => {
      const line = lineIn(s, lineId);
      // Gone already: removed on another tab, or this is a repeated tap.
      if (!line) return nothing(err("notDraft"));
      // Settled on another tab while this screen was open.
      if (isSettled(s, line.orderId)) return nothing(err("settled"));
      return edit(line, s);
    });
  }

  const commands: OrderCommands = {
    setUpTables(count) {
      if (!isTableCount(count)) return Promise.resolve(err("invalidCount"));
      return run("setUpTables", (s) => {
        if (s.tables.length > 0) return nothing(ok(undefined));
        let sortKey: string | undefined;
        const changes = numberedTables(count).map((name) =>
          put({ table: "tables", record: { id: ids.newId() as TableId, name, sortKey: (sortKey = keyBetween(sortKey)) } }),
        );
        return { changes, result: ok(undefined) };
      });
    },

    addTable: () =>
      run(null, (s) => {
        const record: DiningTable = { id: ids.newId() as TableId, name: nextTableName(s.tables), sortKey: "" };
        const changes = placeAt(s.tables, record.id, Infinity).map(({ id, sortKey }) => {
          const base = id === record.id ? record : s.tables.find((t) => t.id === id)!;
          return put({ table: "tables", record: { ...base, sortKey } });
        });
        return { changes, result: changes.find((c) => c.record.id === record.id)!.record as DiningTable };
      }),

    renameTable(id, name) {
      const valid = validateName(name, TABLE_NAME_MAX);
      if (!valid.ok) return Promise.resolve(err(valid.error));
      return run<Result<DiningTable, NameError>>(`renameTable:${id}`, (s) => {
        const table = s.tables.find((t) => t.id === id);
        if (!table) throw new Error(`Nothing to rename: ${id}`);
        const record = { ...table, name: valid.value };
        return { changes: [put({ table: "tables", record })], result: ok(record) };
      });
    },

    removeTable: (id) =>
      run<Result<Undo, "occupied">>(`removeTable:${id}`, (s) => {
        const table = s.tables.find((t) => t.id === id);
        if (!table) return nothing(ok(() => Promise.resolve()));
        if (activeOrderAt(id, activeOrders(s.orders, s.lines))) return nothing(err("occupied"));
        const changes = [remove({ table: "tables", record: table })];
        return { changes, result: ok(undoOf(changes)) };
      }),

    addDish: (order, dish) =>
      run<Result<OrderLine, "outToday" | "settled">>(null, (s) => {
        const now = clock.now();
        const day = businessDate(now);
        if (outOn(s.outOfStock, day).has(dish.item.id)) return nothing(err("outToday"));

        const changes: OrderChange[] = [];
        let target = orderIn(s, order.id);
        // Settled on another tab: a dish for that table starts its next
        // order; a takeaway token, once paid, takes nothing more.
        if (target?.state.status === "settled") {
          if (order.channel.type === "takeaway") return nothing(err("settled"));
          target = undefined;
          order = { ...order, id: ids.newId() as OrderId };
        }
        // Another tab may have opened this table since the screen did.
        if (!target && order.channel.type === "dineIn") {
          target = activeOrderAt(order.channel.tableId, activeOrders(s.orders, s.lines))?.order;
        }
        if (!target) {
          // The token is taken now, against every order this device knows of
          // today, not when the screen opened.
          const channel =
            order.channel.type === "takeaway" ? { type: "takeaway" as const, token: nextToken(s.orders, day) } : order.channel;
          target = { ...order, channel, businessDate: day, openedAt: now, state: { status: "open" } };
          changes.push(put({ table: "orders", record: target }));
        }

        const line = addToDraft(s.lines, target.id, dish, ids.newId() as LineId, now);
        const before = lineIn(s, line.id);
        if (!before || before.quantity !== line.quantity) changes.push(put({ table: "lines", record: line }));
        return { changes, result: ok(line) };
      }),

    stepQuantity: (lineId, by) =>
      // Each stepper tap counts, so these are not de-duplicated.
      editLine<Undo | null>(null, lineId, (line) => {
        const quantity = line.quantity + by;
        if (quantity === 0) {
          if (line.state.status !== "draft") return nothing(err("notDraft"));
          const changes = [remove({ table: "lines", record: line })];
          return { changes, result: ok(undoOf(changes)) };
        }
        const edited = withQuantity(line, quantity);
        if (!edited.ok) return nothing(edited);
        return { changes: [put({ table: "lines", record: edited.value })], result: ok(null) };
      }),

    setNote: (lineId, note) =>
      editLine(`setNote:${lineId}`, lineId, (line) => {
        const edited = withNote(line, note);
        if (!edited.ok) return nothing(edited);
        return { changes: [put({ table: "lines", record: edited.value })], result: edited };
      }),

    removeLine: (lineId) =>
      editLine(`removeLine:${lineId}`, lineId, (line) => {
        if (line.state.status !== "draft") return nothing(err("notDraft"));
        const changes = [remove({ table: "lines", record: line })];
        return { changes, result: ok(undoOf(changes)) };
      }),

    send: (orderId) =>
      run(`send:${orderId}`, (s) => {
        const sent = sendDraft(
          s.lines.filter((l) => l.orderId === orderId),
          ids.newId() as RoundId,
          clock.now(),
        );
        return { changes: sent.map((record) => put({ table: "lines", record })), result: sent.length };
      }),

    voidLine: (lineId, quantity, reason) =>
      editLine(`voidLine:${lineId}`, lineId, (line, s) => {
        const voided = voidSent(line, quantity, reason, ids.newId() as LineId, clock.now());
        if (!voided.ok) return nothing(voided);

        const changes = voided.value.map((record) => put({ table: "lines", record }));
        const split = changes.filter((c) => c.record.id !== line.id);
        const day = today();
        const alreadyOut = outOn(s.outOfStock, day).has(line.itemId);
        const markedOut =
          reason === "outOfStock" && !alreadyOut
            ? [put({ table: "outOfStock", record: { id: outOfStockId(line.itemId, day), itemId: line.itemId, businessDate: day } })]
            : [];
        return {
          changes: [...changes, ...markedOut],
          result: ok(undoOf([put({ table: "lines", record: line })], [...split, ...markedOut])),
        };
      }),

    moveOrder: (orderId, tableId) =>
      run<Result<void, "occupied">>(`moveOrder:${orderId}`, (s) => {
        const order = orderIn(s, orderId);
        if (!order || order.state.status !== "open" || order.channel.type !== "dineIn" || order.channel.tableId === tableId) {
          return nothing(ok(undefined));
        }
        if (activeOrderAt(tableId, activeOrders(s.orders, s.lines))) return nothing(err("occupied"));
        const record: Order = { ...order, channel: { type: "dineIn", tableId } };
        return { changes: [put({ table: "orders", record })], result: ok(undefined) };
      }),

    setOutToday: (itemId, out) =>
      run(`setOutToday:${itemId}`, (s) => {
        const day = today();
        const id = outOfStockId(itemId, day);
        const existing = s.outOfStock.find((r) => r.id === id);
        if (out === Boolean(existing)) return nothing(undefined);
        const record = existing ?? { id, itemId, businessDate: day };
        return { changes: [(out ? put : remove)({ table: "outOfStock", record })], result: undefined };
      }),

    settle: (orderId, payments, discount) =>
      // Keyed: a double tap on Cash settles once and both taps see the same answer.
      run<Result<Undo, SettleError>>(`settle:${orderId}`, (s) => {
        const order = orderIn(s, orderId);
        if (!order) return nothing(err("empty"));
        // Planned against the stored lines, not the screen's: a dish added on
        // another tab since makes the payments fall short, and the sheet says so.
        const at = clock.now();
        const settled = settleOrder(order, s.lines, payments, discount, at);
        if (!settled.ok) return nothing(settled);
        return { changes: [put({ table: "orders", record: settled.value })], result: ok(reopen(orderId, at)) };
      }),

    correctPayments: (orderId, payments) =>
      run<Result<void, CorrectionError>>(`correctPayments:${orderId}`, (s) => {
        const order = orderIn(s, orderId);
        if (!order) return nothing(err("notSettled"));
        const corrected = correctPayments(order, payments, clock.now());
        if (!corrected.ok) return nothing(corrected);
        return { changes: [put({ table: "orders", record: corrected.value })], result: ok(undefined) };
      }),
  };

  return {
    // A subscription kept open past the day's start still holds yesterday's
    // records; every rule filters by day, so that is harmless.
    subscribe: (onChange) =>
      repository.subscribe(today(), (snapshot) => {
        writer.observe(snapshot);
        onChange(snapshot);
      }),
    commands,
  };
}
