import { normalizeName } from "./menu";
import type { OrderLine, Round } from "./order";

// The kitchen order ticket: what the kitchen reads off the slip. Where it
// goes, which round, when and from whom, and the dishes: no prices, which
// the kitchen never needs. A dish cancelled after the kitchen had it gets a
// slip of its own, so they stop cooking it.

export type KotLine = { quantity: number; name: string; portion?: string; note?: string };

export type Kot = {
  /** "Table 4", "Takeaway · Token 12". */
  title: string;
  kind: "round" | "cancel";
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

/** Where the slip goes, in the printer's plain letters: "Table 4", "Garden", "Takeaway - Token 12". */
export function kotTitle(label: { kind: "table"; name: string } | { kind: "token"; token: number }): string {
  if (label.kind === "token") return `Takeaway - Token ${label.token}`;
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
 * The slip as lines of plain text for a 58 mm roll. The quantity stands out
 * on the left; a portion is in capitals ("HALF"), a note sits under its dish.
 * `time` is how the clock reads ("1:42 pm"); kept outside so this stays pure.
 */
export function kotText(kot: Kot, time: string, width = KOT_WIDTH): string[] {
  const rule = "-".repeat(width);
  const head = kot.kind === "cancel" ? "CANCEL" : kot.round === 1 ? "New order" : `Round ${kot.round} - adding`;
  const out = [head, [time, kot.by && `by ${kot.by}`].filter(Boolean).join("  "), rule];
  for (const line of kot.lines) {
    const qty = `${line.quantity} x `;
    const dish = line.portion === undefined ? line.name : `${line.name} ${line.portion.toUpperCase()}`;
    const [first = "", ...more] = wrap(dish, width - qty.length);
    out.push(qty + first, ...more.map((m) => " ".repeat(qty.length) + m));
    if (line.note) out.push(...wrap(`> ${line.note}`, width - qty.length).map((n) => " ".repeat(qty.length) + n));
  }
  out.push(rule);
  return out;
}
