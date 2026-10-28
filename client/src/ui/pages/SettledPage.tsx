import { useState } from "react";
import { MdChevronLeft } from "react-icons/md";
import { Link } from "react-router";
import type { OrderId } from "../../domain/order";
import { useOrders, type SettledSummary } from "../../usecases/useOrders";
import { ListRow, ListSection } from "../design-system/GroupedList";
import { paidByLabel, shortOrderTitle } from "../features/order/labels";
import { OrderIcon } from "../features/order/OrderIcon";
import { SettledSheet } from "../features/order/SettledSheet";
import { formatPrice, formatTime } from "../format";

// Today's paid bills, latest first, with what the cash box should hold. A
// bill opens to show what the table had and how it paid.
export default function SettledPage() {
  const orders = useOrders();
  // Visual-only state: which paid bill is open.
  const [viewing, setViewing] = useState<OrderId | null>(null);

  const header = (
    <header className="sticky top-0 z-10 -mx-4 mb-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2 bg-bg/95 px-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 backdrop-blur md:-mx-6 md:px-4">
      <Link to="/orders" className="-ml-1 flex min-h-11 items-center justify-self-start pr-2 text-[17px] text-primary">
        <MdChevronLeft aria-hidden className="text-3xl" />
        Orders
      </Link>
      <h1 className="truncate text-[17px] font-semibold">Settled today</h1>
      <span />
    </header>
  );
  if (orders.state === "loading") return header;

  const { settled, takings } = orders;
  const row = (bill: SettledSummary) => {
    const { state } = bill.order;
    const detail = [
      paidByLabel(bill.bill.payments),
      bill.bill.discount && `${formatPrice(bill.bill.discount.amount)} off`,
      bill.bill.payments.some((p) => p.correctedAt) && "corrected",
    ]
      .filter(Boolean)
      .join(" · ");
    return (
      <ListRow
        key={bill.order.id}
        detail={detail}
        leading={<OrderIcon channel={bill.order.channel} />}
        trailing={
          <span className="shrink-0 text-right">
            <span className="block text-[17px] tabular-nums">{formatPrice(bill.bill.paid)}</span>
            <span className="block text-[13px] text-muted">{formatTime(state.settledAt)}</span>
          </span>
        }
        onClick={() => setViewing(bill.order.id)}
      >
        {shortOrderTitle(bill.label)}
      </ListRow>
    );
  };

  return (
    <section className="mx-auto max-w-3xl">
      {header}
      <div className="mb-6 grid grid-cols-3 gap-3 text-center">
        {[
          ["Total", takings.total],
          ["Cash", takings.cash],
          ["UPI", takings.upi],
        ].map(([label, amount]) => (
          <div key={label as string} className="rounded-2xl bg-surface px-2 py-3">
            <p className="text-[13px] font-semibold text-muted">{label}</p>
            <p className="mt-0.5 text-[20px] font-bold tabular-nums">{formatPrice(amount as typeof takings.total)}</p>
          </div>
        ))}
      </div>
      {settled.length === 0 ? (
        <p className="py-12 text-center text-[15px] text-muted">Nothing settled yet today.</p>
      ) : (
        <ListSection header={`${settled.length} ${settled.length === 1 ? "bill" : "bills"}`}>{settled.map(row)}</ListSection>
      )}
      <SettledSheet bill={settled.find((s) => s.order.id === viewing) ?? null} orders={orders} onClose={() => setViewing(null)} />
    </section>
  );
}
