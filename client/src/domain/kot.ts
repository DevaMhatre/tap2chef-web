import { normalizeName } from "./menu";
import { isLive, ticketOf, type BusinessDate, type Order, type OrderId, type OrderLine, type Round } from "./order";

// The kitchen order ticket: what the kitchen reads off the slip. Where it
// goes, which round, when and from whom, and the dishes: no prices, which
// the kitchen never needs. A dish cancelled after the kitchen had it gets a
// slip of its own, so they stop cooking it.

export type KotLine = { quantity: number; name: string; portion?: string; note?: string };

export type Kot = {
  /** "Table 4", "Parcel 12". */
  title: string;
  kind: "round" | "cancel";
  /** "KOT 14": counted from 1 each trading day, so the kitchen's pile can be tallied against the bills. */
  number?: number;
  /** Printed again (lost or torn): it says so, as a reprint is worth a look. */
  reprint?: boolean;
  /** Round 1 is the first order; later ones are additions. */
  round: number;
  at: number;
  by?: string;
  lines: KotLine[];
};

const lineOf = (line: OrderLine): KotLine => ({
  quantity: line.quantity,
  name: line.name,
  ...(line.portion !== undefined && { portion: line.portion }),
  ...(line.note !== "" && { note: line.note }),
});

/** One round as the kitchen received it; cancelled dishes left out (they have their own slip). */
export function kotForRound(title: string, round: Round, by?: string): Kot {
  return {
    title,
    kind: "round",
    round: round.number,
    at: round.sentAt,
    ...(by !== undefined && { by }),
    lines: round.lines.filter((l) => l.state.status === "sent").map(lineOf),
  };
}

/** A dish cancelled after it was sent. */
export function kotForCancel(title: string, round: number, line: OrderLine & { state: { status: "voided"; voidedAt: number } }): Kot {
  return {
    title,
    kind: "cancel",
    round,
    at: line.state.voidedAt,
    ...(line.state.by !== undefined && { by: line.state.by }),
    lines: [lineOf(line)],
  };
}

/** Where the slip goes, in the kitchen's words: "Table 4", "Garden", "Parcel 12". */
export function kotTitle(label: { kind: "table"; name: string } | { kind: "token"; token: number }): string {
  if (label.kind === "token") return `Parcel ${label.token}`;
  return /^\d+$/.test(label.name) ? `Table ${label.name}` : label.name;
}

/** Characters a 58 mm printer fits on a line in its normal font. */
export const KOT_WIDTH = 32;

/** Splits text into lines of at most `width`, at spaces where it can. */
export function wrap(text: string, width: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const word of normalizeName(text).split(" ")) {
    for (let rest = word; rest.length > 0; ) {
      const room = line === "" ? width : width - line.length - 1;
      if (rest.length <= room) {
        line = line === "" ? rest : `${line} ${rest}`;
        rest = "";
      } else if (line !== "") {
        out.push(line);
        line = "";
      } else {
        out.push(rest.slice(0, width));
        rest = rest.slice(width);
      }
    }
  }
  if (line !== "") out.push(line);
  return out;
}

/**
 * One row of the slip and how it prints: `small` for the KOT number and time,
 * `title` huge (table or parcel, the first thing the cook reads), `dish` tall
 * and bold, `banner` reversed (CANCEL, REPRINT) so it can't be missed.
 */
export type KotRow = { text: string; style: "small" | "title" | "banner" | "dish" | "note" };

/** Characters a row of each style fits: double width halves them. */
export const ROW_WIDTH: Record<KotRow["style"], number> = { small: KOT_WIDTH, note: KOT_WIDTH, dish: KOT_WIDTH, title: KOT_WIDTH / 2, banner: KOT_WIDTH / 2 };

/**
 * The slip for a 58 mm roll, in the shape the kitchen already reads ("Veg Dum
 * Biryani (1)"): KOT number and time, where it goes, what it is, the dishes
 * (a portion in capitals), notes under their dish, who sent it. No prices.
 * `time` is how the clock reads ("7:04 pm"); kept outside so this stays pure.
 */
export function kotLayout(kot: Kot, time: string): KotRow[] {
  const rows: KotRow[] = [];
  const add = (style: KotRow["style"], text: string) => rows.push(...wrap(text, ROW_WIDTH[style]).map((t) => ({ text: t, style })));
  const number = kot.number === undefined ? "" : `KOT ${kot.number}`;
  rows.push({ text: number + " ".repeat(Math.max(1, KOT_WIDTH - number.length - time.length)) + time, style: "small" });
  add("title", kot.title);
  if (kot.kind === "cancel") add("banner", "CANCEL");
  if (kot.reprint) add("banner", "REPRINT");
  if (kot.kind === "round" && kot.round > 1) add("small", `Round ${kot.round} - adding`);
  for (const line of kot.lines) {
    // A long dish carries on indented, so its second line never reads as another dish.
    const [first = "", ...more] = wrap(`${line.name}${line.portion === undefined ? "" : ` ${line.portion.toUpperCase()}`} (${line.quantity})`, ROW_WIDTH.dish);
    rows.push({ text: first, style: "dish" });
    if (more.length > 0) rows.push(...wrap(more.join(" "), ROW_WIDTH.dish - 2).map((t) => ({ text: `  ${t}`, style: "dish" as const })));
    if (line.note) rows.push(...wrap(`> ${line.note}`, ROW_WIDTH.note - 2).map((t) => ({ text: `  ${t}`, style: "note" as const })));
  }
  if (kot.by) add("small", kot.by);
  return rows;
}

// ---------------------------------------------------------------- printing by itself

/**
 * A slip the kitchen got: a record of its own, so every phone knows a round
 * was printed (none prints it twice) and a KOT number is never given twice.
 * Its id names what it was for: a round, or one cancelled dish.
 */
export type KotPrint = {
  id: string;
  orderId: OrderId;
  businessDate: BusinessDate;
  number: number;
  kind: "round" | "cancel";
  printedAt: number;
  /** How many times it was printed again. */
  reprints?: number;
  /** A round's dishes already cancelled when it printed: left off the slip, so no CANCEL slip for them either. */
  cancelledBefore?: string[];
};

export const roundPrintId = (roundId: string): string => `round:${roundId}`;
export const cancelPrintId = (lineId: string): string => `cancel:${lineId}`;

/** The next KOT number of the trading day; the day starts at 4 am, like every number here. */
export function nextKotNumber(prints: readonly KotPrint[], day: BusinessDate): number {
  return Math.max(0, ...prints.filter((p) => p.businessDate === day).map((p) => p.number)) + 1;
}

/** One slip the printing phone still owes the kitchen. */
export type KotJob =
  | { id: string; kind: "round"; order: Order; round: Round }
  | { id: string; kind: "cancel"; order: Order; round: Round; line: OrderLine & { state: { status: "voided"; voidedAt: number } } };

/**
 * What still has to print, oldest first: every round sent and not yet
 * printed, and every dish cancelled after its round was printed (a dish
 * cancelled before the kitchen had it needs no slip). `known` holds what
 * existed when this phone started printing, so turning printing on never
 * prints the day's old rounds. Paid orders count too: a parcel paid on the
 * spot still has to be cooked.
 */
export function kotJobs(
  orders: readonly Order[],
  lines: readonly OrderLine[],
  prints: readonly KotPrint[],
  known: ReadonlySet<string>,
): KotJob[] {
  const printed = new Set(prints.map((p) => p.id));
  const jobs: { at: number; job: KotJob }[] = [];
  for (const order of orders) {
    for (const round of ticketOf(lines.filter((l) => l.orderId === order.id)).rounds) {
      const id = roundPrintId(round.id);
      const cooking = round.lines.some((l) => l.state.status === "sent");
      if (cooking && !printed.has(id) && !known.has(id)) jobs.push({ at: round.sentAt, job: { id, kind: "round", order, round } });
      const roundPrint = prints.find((p) => p.id === id);
      if (!roundPrint) continue;
      const leftOff = new Set(roundPrint.cancelledBefore ?? []);
      for (const line of round.lines) {
        if (line.state.status !== "voided") continue;
        const cancel = cancelPrintId(line.id);
        if (printed.has(cancel) || known.has(cancel) || leftOff.has(line.id)) continue;
        jobs.push({ at: line.state.voidedAt, job: { id: cancel, kind: "cancel", order, round, line: line as Extract<KotJob, { kind: "cancel" }>["line"] } });
      }
    }
  }
  return jobs.sort((a, b) => a.at - b.at || (a.job.id < b.job.id ? -1 : 1)).map((j) => j.job);
}

/** The round's dishes cancelled by the time its slip prints: the slip leaves them off. */
export const cancelledIn = (round: Round): string[] => round.lines.filter((l) => l.state.status === "voided").map((l) => l.id);

/** Everything that exists now, to start printing from here on. */
export function knownNow(orders: readonly Order[], lines: readonly OrderLine[]): Set<string> {
  const known = new Set<string>();
  for (const order of orders) {
    for (const round of ticketOf(lines.filter((l) => l.orderId === order.id)).rounds) {
      known.add(roundPrintId(round.id));
      for (const line of round.lines) if (line.state.status === "voided") known.add(cancelPrintId(line.id));
    }
  }
  return known;
}

/**
 * The night's tally, done for the owner: the day's KOTs, and those whose bill
 * hasn't been paid (food that may have left without payment). The paper pile
 * stays for whoever likes it; nobody has to match it by hand.
 */
export type KotTally = { count: number; first?: number; last?: number; cancels: number; unpaid: KotPrint[] };

/**
 * `orders` and `lines` must hold every order a KOT of the day was printed for,
 * whatever day the order belongs to (one left open past 4 am). An order whose
 * every dish was cancelled owes nothing: it isn't "not paid".
 */
export function kotTally(prints: readonly KotPrint[], orders: readonly Order[], lines: readonly OrderLine[], day: BusinessDate): KotTally {
  const mine = prints.filter((p) => p.businessDate === day).sort((a, b) => a.number - b.number);
  const owing = new Set(
    orders.filter((o) => o.state.status !== "settled" && lines.some((l) => l.orderId === o.id && isLive(l))).map((o) => o.id),
  );
  const rounds = mine.filter((p) => p.kind === "round");
  return {
    count: mine.length,
    ...(mine.length > 0 && { first: mine[0]!.number, last: mine.at(-1)!.number }),
    cancels: mine.length - rounds.length,
    // One unpaid line per order, under its first KOT: three rounds at table 4 are one bill.
    unpaid: rounds.filter((p, i) => owing.has(p.orderId) && rounds.findIndex((q) => q.orderId === p.orderId) === i),
  };
}

/**
 * Where a round's slip is, as the waiter who sent it sees it. A waiter's
 * round reaches the printing phone through the account, so a phone without
 * internet can't get it there: it says so, plainly. Nothing is guessed from
 * time (rounds sent before printing began never print, and that is no fault),
 * and a restaurant that prints no KOTs never sees any of this.
 */
export type KotStatus = { kind: "none" } | { kind: "printed"; number: number } | { kind: "offline" };

export function kotStatus(round: Pick<Round, "id">, prints: readonly KotPrint[], online: boolean): KotStatus {
  const printed = prints.find((p) => p.id === roundPrintId(round.id));
  if (printed) return { kind: "printed", number: printed.number };
  return prints.length > 0 && !online ? { kind: "offline" } : { kind: "none" };
}
