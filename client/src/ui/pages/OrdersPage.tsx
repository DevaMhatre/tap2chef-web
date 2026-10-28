import { MdAdd, MdChevronRight, MdReceiptLong } from "react-icons/md";
import { useNavigate } from "react-router";
import type { Paise } from "../../domain/money";
import { dishCount } from "../../domain/order";
import { useOrders, type OrderSummary } from "../../usecases/useOrders";
import { Button } from "../design-system/Button";
import { ListRow, ListSection } from "../design-system/GroupedList";
import { PageHeader } from "../design-system/PageHeader";
import { shortOrderTitle } from "../features/order/labels";
import { OrderIcon } from "../features/order/OrderIcon";
import { formatPrice, formatSentAgo, formatWaited } from "../format";
import { useNow } from "../useNow";

// The live service: every order with something on it, dine-in apart from
// takeaway, the one waiting longest at the top. What is already paid is one
// row at the bottom, a tap away, never in the way.
export default function OrdersPage() {
  const orders = useOrders();
  const navigate = useNavigate();
  const now = useNow();

  if (orders.state === "loading") return <PageHeader title="Orders" />;

  const open = (summary: OrderSummary) =>
    navigate(summary.order.channel.type === "dineIn" ? `/tables/${summary.order.channel.tableId}` : `/orders/${summary.order.id}`);
  const row = (summary: OrderSummary) => {
    const { ticket, bill, order } = summary;
    const dishes = dishCount(summary.lines);
    const unsent = dishCount(ticket.draft);
    const billed = order.state.status === "billed" ? order.state : null;
    const detail = billed ? (
      <span className="font-semibold text-warning">
        {bill.paid > 0 ? `${formatPrice(bill.paid)} paid` : "Bill given"} · waiting {formatWaited(billed.billedAt, now)}
      </span>
    ) : (
      <>
        {dishes} {dishes === 1 ? "dish" : "dishes"} ·{" "}
        {unsent > 0 ? (
          <span className="font-semibold text-primary">{unsent} not sent</span>
        ) : ticket.lastSentAt ? (
          formatSentAgo(ticket.lastSentAt, now)
        ) : null}
      </>
    );
    return (
      <ListRow
        key={order.id}
        detail={detail}
        leading={<OrderIcon channel={order.channel} />}
        trailing={
          <span className="text-[17px] font-semibold tabular-nums">{formatPrice(Math.max(0, bill.remaining) as Paise)}</span>
        }
        onClick={() => open(summary)}
      >
        {shortOrderTitle(summary.label)}
      </ListRow>
    );
  };
  const { settled, takings } = orders;
  const dineIn = orders.today.filter((o) => o.order.channel.type === "dineIn");
  const takeaway = orders.today.filter((o) => o.order.channel.type === "takeaway");
  const nothingOpen = orders.earlier.length === 0 && orders.today.length === 0;
  const newTakeaway = () => navigate(`/orders/${orders.newTakeaway()}`);

  return (
    <section className="mx-auto max-w-3xl">
      <PageHeader
        title="Orders"
        actions={
          <Button onClick={newTakeaway}>
            <MdAdd className="-ml-1 text-xl" /> Takeaway
          </Button>
        }
      />
      <div className="space-y-6">
        {nothingOpen && (
          <div className={`flex flex-col items-center justify-center text-center ${settled.length > 0 ? "py-12" : "min-h-[50dvh]"}`}>
            <MdReceiptLong className="mb-3 text-5xl text-muted/60" aria-hidden />
            <p className="text-[17px] font-semibold">No open orders</p>
            <p className="mt-1 text-[15px] text-muted">Tap a table, or start a takeaway.</p>
          </div>
        )}
        {orders.earlier.length > 0 && (
          <ListSection header="Still open from yesterday" footer="Settle or cancel these so the day's numbers are right.">
            {orders.earlier.map(row)}
          </ListSection>
        )}
        {dineIn.length > 0 && <ListSection header={`Dine-in · ${dineIn.length}`}>{dineIn.map(row)}</ListSection>}
        {takeaway.length > 0 && <ListSection header={`Takeaway · ${takeaway.length}`}>{takeaway.map(row)}</ListSection>}
        {settled.length > 0 && (
          <ListSection>
            <ListRow
              detail={`Cash ${formatPrice(takings.cash)} · UPI ${formatPrice(takings.upi)}`}
              trailing={
                <span className="flex items-center gap-1 text-[17px] font-semibold tabular-nums">
                  {formatPrice(takings.total)}
                  <MdChevronRight aria-hidden className="-mr-1 text-2xl text-muted" />
                </span>
              }
              onClick={() => navigate("/orders/settled")}
            >
              Settled today · {settled.length} {settled.length === 1 ? "bill" : "bills"}
            </ListRow>
          </ListSection>
        )}
      </div>
    </section>
  );
}
