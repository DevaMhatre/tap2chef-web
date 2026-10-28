import { MdAdd, MdReceiptLong, MdShoppingBag, MdTableRestaurant } from "react-icons/md";
import { dishCount } from "../../domain/order";
import { useNavigate } from "react-router";
import { useOrders, type OrderSummary } from "../../usecases/useOrders";
import { Button } from "../design-system/Button";
import { ListRow, ListSection } from "../design-system/GroupedList";
import { PageHeader } from "../design-system/PageHeader";
import { shortOrderTitle } from "../features/order/labels";
import { formatPrice, formatSentAgo } from "../format";
import { useNow } from "../useNow";

// Every order with something on it, dine-in apart from takeaway, each oldest
// first: the one waiting longest is at the top.
export default function OrdersPage() {
  const orders = useOrders();
  const navigate = useNavigate();
  const now = useNow();

  if (orders.state === "loading") return <PageHeader title="Orders" />;

  const open = (summary: OrderSummary) =>
    navigate(summary.order.channel.type === "dineIn" ? `/tables/${summary.order.channel.tableId}` : `/orders/${summary.order.id}`);
  const row = (summary: OrderSummary) => {
    const { ticket } = summary;
    const dishes = dishCount(summary.lines);
    const unsent = dishCount(ticket.draft);
    const takeaway = summary.order.channel.type === "takeaway";
    const Icon = takeaway ? MdShoppingBag : MdTableRestaurant;
    const detail = (
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
        key={summary.order.id}
        detail={detail}
        leading={
          <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-xl text-muted">
            <Icon />
          </span>
        }
        trailing={<span className="text-[17px] font-semibold tabular-nums">{formatPrice(ticket.total)}</span>}
        onClick={() => open(summary)}
      >
        {shortOrderTitle(summary.label)}
      </ListRow>
    );
  };
  const dineIn = orders.today.filter((o) => o.order.channel.type === "dineIn");
  const takeaway = orders.today.filter((o) => o.order.channel.type === "takeaway");
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
      {orders.earlier.length === 0 && orders.today.length === 0 ? (
        <div className="flex min-h-[50dvh] flex-col items-center justify-center text-center">
          <MdReceiptLong className="mb-3 text-5xl text-muted/60" aria-hidden />
          <p className="text-[17px] font-semibold">No open orders</p>
          <p className="mt-1 text-[15px] text-muted">Tap a table, or start a takeaway.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {orders.earlier.length > 0 && (
            <ListSection header="Still open from yesterday" footer="Settle or cancel these so the day's numbers are right.">
              {orders.earlier.map(row)}
            </ListSection>
          )}
          {dineIn.length > 0 && <ListSection header={`Dine-in · ${dineIn.length}`}>{dineIn.map(row)}</ListSection>}
          {takeaway.length > 0 && (
            <ListSection header={`Takeaway · ${takeaway.length}`}>{takeaway.map(row)}</ListSection>
          )}
        </div>
      )}
    </section>
  );
}
