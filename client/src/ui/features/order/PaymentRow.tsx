import type { ReactNode } from "react";
import { counts, type Payment } from "../../../domain/order";
import { formatPrice, formatTime } from "../../format";
import { tenderLabel } from "./labels";

// One payment on a bill: how much, how, when and by whom. A removed one
// stays, struck through, like a cancelled dish; a corrected one says so.
// `methodShown`: a control beside it already says Cash or UPI, so the line
// leaves it out and "by Ravi" fits on a phone.
export function PaymentRow({ payment, methodShown = false, children }: { payment: Payment; methodShown?: boolean; children?: ReactNode }) {
  const removed = !counts(payment);
  const detail = removed
    ? `${tenderLabel(payment)} · removed ${formatTime(payment.removedAt!)}`
    : payment.correctedAt
      ? `Corrected ${formatTime(payment.correctedAt)}`
      : [methodShown ? undefined : tenderLabel(payment), formatTime(payment.receivedAt), payment.by && `by ${payment.by}`].filter(Boolean).join(" · ");
  return (
    <div className={`flex min-h-11 items-center gap-3 px-4 py-2 ${removed ? "text-muted" : ""}`}>
      <span className="min-w-0 flex-1">
        <span className={`block text-[17px] tabular-nums ${removed ? "line-through" : ""}`}>{formatPrice(payment.amount)}</span>
        <span className={`block truncate text-[13px] ${payment.correctedAt && !removed ? "font-semibold text-warning" : "text-muted"}`}>
          {detail}
        </span>
      </span>
      {children}
    </div>
  );
}
