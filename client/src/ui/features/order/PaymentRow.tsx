import type { ReactNode } from "react";
import { counts, type Payment } from "../../../domain/order";
import { formatPrice, formatTime } from "../../format";
import { METHOD_LABEL } from "./labels";

// One payment on a bill: how much, how and when. A removed one stays,
// struck through, like a cancelled dish; a corrected one says so.
export function PaymentRow({ payment, children }: { payment: Payment; children?: ReactNode }) {
  const removed = !counts(payment);
  const detail = removed
    ? `${METHOD_LABEL[payment.method]} · removed ${formatTime(payment.removedAt!)}`
    : payment.correctedAt
      ? `Corrected ${formatTime(payment.correctedAt)}`
      : `${METHOD_LABEL[payment.method]} · ${formatTime(payment.receivedAt)}`;
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
