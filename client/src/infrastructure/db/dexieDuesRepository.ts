import { liveQuery } from "dexie";
import type { Repayment, RepaymentId } from "../../domain/dues";
import type { Paise } from "../../domain/money";
import type { BusinessDate } from "../../domain/order";
import type { DuesRepository, DuesSnapshot, RepaymentChange } from "../../usecases/ports";
import { db, type StoredRecord } from "./db";
import { toPayment } from "./dexieOrderRepository";
import { isPaise, isText, isTime, readAll } from "./parse";
import { writeAll } from "./repo";

// Anti-corruption layer between stored records and a regular's dues.

const isDate = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

export function toRepayment(r: StoredRecord): Repayment | undefined {
  if (!isText(r.customer) || typeof r.phone !== "string" || !/^[6-9]\d{9}$/.test(r.phone) || !isPaise(r.amount) || r.amount === 0 || (r.method !== "cash" && r.method !== "upi")) return undefined;
  if (!isTime(r.receivedAt) || !isDate(r.businessDate)) return undefined;
  return {
    id: r.id as RepaymentId,
    customer: r.customer,
    phone: r.phone,
    amount: r.amount as Paise,
    method: r.method,
    receivedAt: r.receivedAt,
    businessDate: r.businessDate as BusinessDate,
    ...(isText(r.by) && { by: r.by }),
  };
}

// Every payment is read to find the ones on a name: a small restaurant's
// whole history is thousands of rows, not millions.
async function readDues(): Promise<DuesSnapshot> {
  const [payments, repayments] = await Promise.all([
    db.payments.filter((r) => r.method === "later").toArray(),
    db.repayments.toArray(),
  ]);
  return { later: readAll(payments, toPayment, "payment"), repayments: readAll(repayments, toRepayment, "repayment") };
}

export const dexieDuesRepository: DuesRepository = {
  subscribe(onChange) {
    const subscription = liveQuery(readDues).subscribe({
      next: onChange,
      error: (error) => console.error("Dues query failed", error),
    });
    return () => subscription.unsubscribe();
  },

  write: (changes: readonly RepaymentChange[]) =>
    writeAll(changes.map((c) => ({ table: "repayments" as const, record: c.record, op: c.op }))),
};
