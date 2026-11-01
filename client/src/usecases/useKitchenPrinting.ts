import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { cancelledIn, kotForCancel, kotForRound, kotJobs, kotTitle, knownNow, nextKotNumber, type KotJob } from "../domain/kot";
import { businessDate } from "../domain/order";
import { err, type Result } from "../domain/result";
import type { PrinterState } from "./ports";
import { usePorts } from "./PortsProvider";
import { useOrderDesk } from "./useOrderDesk";
import { labelOf } from "./useOrders";

/** If a slip didn't go out (paper, a blip), when to try again. */
export const RETRY_AFTER_MS = 5000;

export type KitchenPrinting = {
  state: PrinterState;
  /** KOTs sent and not yet printed. */
  waiting: number;
  /** The orders are read: only then can this phone tell old rounds from new ones and start printing. */
  loaded: boolean;
  /** This phone prints but has no internet: waiters' rounds can't reach it (its own still print). */
  offline: boolean;
  /** This phone prints every KOT from now on: the browser asks which printer. */
  connect(): Promise<Result<void, "cancelled" | "unsupported" | "failed">>;
  reconnect(): Promise<Result<void, "needsTap" | "failed">>;
  /** This phone stops printing. */
  stop(): Promise<void>;
};

/**
 * Prints every KOT on the phone that holds the kitchen printer, whoever sent
 * the round: a waiter's Send reaches this phone by sync and comes out here.
 * One at a time, oldest first, each once (a record says it was printed), and
 * numbered from 1 each trading day by this phone, so no two slips share one.
 */
export function useKitchenPrinting(): KitchenPrinting {
  const { printerLink, clock, network } = usePorts();
  const online = useSyncExternalStore(network.subscribe, network.isOnline);
  const { commands, snapshot } = useOrderDesk();
  const [state, setState] = useState<PrinterState>({ kind: "none" });
  const [known, setKnown] = useState<ReadonlySet<string> | null>(null);
  const [retry, setRetry] = useState(0);
  const printing = useRef(false);
  // Printed here and not yet seen in the records: never twice, whatever arrives first.
  const [done, setDone] = useState<ReadonlySet<string>>(new Set());
  // The last number given here: the record of a slip just printed may not be back yet.
  const last = useRef<{ day: string; number: number }>({ day: "", number: 0 });

  useEffect(() => printerLink.subscribe(setState), [printerLink]);
  // What existed when this phone started printing, read once (after a reload): a start sets it directly.
  const holding = state.kind === "ready" || state.kind === "lost";
  useEffect(() => {
    if (holding && known === null) void printerLink.known().then((k) => setKnown((now) => now ?? k));
  }, [printerLink, holding, known]);

  const holds = state.kind === "ready" || state.kind === "lost" || state.kind === "connecting";
  const jobs: KotJob[] = holds && snapshot && known ? kotJobs(snapshot.orders, snapshot.lines, snapshot.kotPrints, known) : [];
  const owed = jobs.filter((j) => !done.has(j.id));
  const next = owed[0];

  useEffect(() => {
    if (state.kind !== "ready" || !next || !snapshot || printing.current) return;
    printing.current = true;
    const now = clock.now();
    const today = businessDate(now);
    const title = kotTitle(labelOf({ order: next.order }, snapshot.tables));
    const number = Math.max(nextKotNumber(snapshot.kotPrints, today), last.current.day === today ? last.current.number + 1 : 1);
    const kot = { ...(next.kind === "round" ? kotForRound(title, next.round) : kotForCancel(title, next.round.number, next.line)), number };
    let timer: ReturnType<typeof setTimeout> | undefined;
    void printerLink
      .print(kot)
      .then(async (printed) => {
        if (printed.ok) {
          last.current = { day: today, number };
          // It is on paper: done here whatever happens to its record, so it never prints twice.
          await commands
            .notePrinted({
              id: next.id,
              orderId: next.order.id,
              businessDate: today,
              number,
              kind: next.kind,
              printedAt: now,
              ...(next.kind === "round" && cancelledIn(next.round).length > 0 && { cancelledBefore: cancelledIn(next.round) }),
            })
            .catch((error) => console.error("A printed KOT wasn't noted", error));
          printing.current = false;
          // Marking it done looks again: the next slip may have arrived while this one printed.
          setDone((was) => new Set(was).add(next.id));
        } else {
          printing.current = false;
          timer = setTimeout(() => setRetry((n) => n + 1), RETRY_AFTER_MS);
        }
      })
      .catch(() => {
        printing.current = false;
      });
    return () => clearTimeout(timer);
  }, [state.kind, next?.id, snapshot, printerLink, commands, clock, retry, done]); // eslint-disable-line react-hooks/exhaustive-deps

  const connect = useCallback(async () => {
    // Whatever was sent before this phone printed stays as it was: no surprise pile of old slips.
    if (!snapshot) return err("failed" as const);
    // Picking the printer again (it was lost) keeps the KOTs waiting meanwhile: only a fresh start forgets the past.
    const existing = state.kind === "none" ? knownNow(snapshot.orders, snapshot.lines) : (known ?? (await printerLink.known()));
    // Set before the printer answers, so not one render runs on an older start's list.
    setKnown(existing);
    return printerLink.connect([...existing]);
  }, [printerLink, snapshot, state.kind, known]);

  return {
    state,
    waiting: owed.length,
    loaded: snapshot !== null,
    offline: state.kind === "ready" && !online,
    connect,
    reconnect: () => printerLink.reconnect(),
    // A later start begins from what exists then, never from this one's list.
    stop: async () => {
      setKnown(null);
      await printerLink.forget();
    },
  };
}
