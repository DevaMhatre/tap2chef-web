import { useEffect, useMemo, useState } from "react";
import {
  duesOf,
  knownCustomers,
  receiveRepayment,
  totalOwed,
  type Due,
  type Regular,
  type Repayment,
  type RepaymentId,
} from "../domain/dues";
import { paise, parseRupees, type Paise } from "../domain/money";
import { businessDate, type BusinessDate } from "../domain/order";
import { err, ok, type Result } from "../domain/result";
import { receiptFor, type PaymentMethod, type Receipt, type ReceiveError } from "../domain/settlement";
import { applyChanges } from "./applyChanges";
import type { Undo } from "./menuEditor";
import type { Clock, DuesRepository, DuesSnapshot, IdGenerator, RepaymentChange } from "./ports";
import { usePorts } from "./PortsProvider";
import { createSerialWriter } from "./serialWriter";
import { usePersonName } from "./useOrderDesk";
import { useCan } from "./usePermissions";
import { useDeviceSession } from "./useSignIn";

export type RepayError = ReceiveError | "nothingOwed" | "invalid";
export type Repaid = { repayment: Repayment; change: Paise; undo: Undo };

export type DueCommands = {
  /** What taking `given` would record and hand back, before anyone taps; null until it's a number. */
  quote(due: Due, method: PaymentMethod, given: string): Result<Receipt, ReceiveError | "invalid"> | null;
  /** An id fixed when the sheet opens, so a double tap can't take the money twice. */
  newId(): RepaymentId;
  /** A regular (by their number) paying back, part or all. `given` as typed. */
  receive(id: RepaymentId, phone: string, method: PaymentMethod, given: string): Promise<Result<Repaid, RepayError>>;
};

export function createDueBook(repository: DuesRepository, ids: IdGenerator, clock: Clock, who: () => string | undefined) {
  const writer = createSerialWriter<DuesSnapshot, RepaymentChange>((changes) => repository.write(changes), applyChanges);
  const undoOf = (record: Repayment): Undo => () =>
    writer.run(`undo:${record.id}`, () => ({ changes: [{ table: "repayments", record, op: "remove" }], result: undefined }));

  const commands: DueCommands = {
    newId: () => ids.newId() as RepaymentId,

    quote(due, method, given) {
      if (given.trim() === "") return null;
      const amount = parseRupees(given);
      return amount === undefined ? err("invalid") : receiptFor(method, amount, paise(Math.max(0, due.owed)));
    },

    receive: (id, phone, method, given) =>
      writer.run<Result<Repaid, RepayError>>(`receive:${id}`, (s) => {
        const known = s.repayments.find((r) => r.id === id);
        // Taken already (a double tap): the same answer, nothing written twice.
        if (known) return { changes: [], result: ok({ repayment: known, change: 0 as Paise, undo: undoOf(known) }) };
        const amount = parseRupees(given);
        if (amount === undefined) return { changes: [], result: err("invalid") };
        // Against what they owe on the stored records, not what the screen showed.
        const due = duesOf(s.later, s.repayments).find((d) => d.phone === phone);
        const made = receiveRepayment(due, method, amount, id, clock.now(), who());
        if (!made.ok) return { changes: [], result: made };
        const { repayment, change } = made.value;
        return { changes: [{ table: "repayments", record: repayment, op: "put" }], result: ok({ repayment, change, undo: undoOf(repayment) }) };
      }),
  };

  return {
    subscribe: (onChange: (snapshot: DuesSnapshot) => void) =>
      repository.subscribe((snapshot) => {
        writer.observe(snapshot);
        onChange(snapshot);
      }),
    commands,
  };
}

export type Dues =
  | { state: "loading" }
  | ({
      state: "ready";
      /** Everyone who owes (or was paid back twice), longest waiting first. */
      dues: Due[];
      total: Paise;
      /** Names to offer on the bill, most recent first. */
      regulars: Regular[];
      today: BusinessDate;
    } & DueCommands);

export function useDues(): Dues {
  const { dues: repository, ids, clock } = usePorts();
  const who = usePersonName();
  // Only where bills go on names: a waiter's phone never reads every payment.
  // Asked once who works this phone is known: before that, it counts as the owner's.
  const known = useDeviceSession() !== undefined;
  const allowed = useCan()("payments.later") && known;
  const book = useMemo(() => createDueBook(repository, ids, clock, who), [repository, ids, clock, who]);
  const [snapshot, setSnapshot] = useState<DuesSnapshot | null>(null);
  useEffect(() => (allowed ? book.subscribe(setSnapshot) : undefined), [book, allowed]);
  if (!allowed || !snapshot) return { state: "loading" };

  const dues = duesOf(snapshot.later, snapshot.repayments);
  return {
    state: "ready",
    dues,
    total: totalOwed(dues),
    regulars: knownCustomers(snapshot.later, snapshot.repayments),
    today: businessDate(clock.now()),
    ...book.commands,
  };
}
