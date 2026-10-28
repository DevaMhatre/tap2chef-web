import { Link } from "react-router";
import type { Paise } from "../../../domain/money";
import type { TableView } from "../../../usecases/useTables";
import { formatPrice, formatSentAgo, formatWaited } from "../../format";
import { useNow } from "../../useNow";
import { tableTitle } from "../order/labels";

// The floor at a glance: a quiet tile is free; a solid one has guests, with
// what they owe and how long since their last round went to the kitchen. A
// table holding its bill turns amber: money is waiting, and the clock counts
// from when the bill went over.
export function TableGrid({ floor }: { floor: TableView[] }) {
  const now = useNow();
  return (
    <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
      {floor.map(({ table, active }) => {
        const unsent = active ? active.ticket.draft.length > 0 : false;
        const lastSent = active?.ticket.lastSentAt;
        const billed = active?.order.state.status === "billed" ? active.order.state : null;
        const owed = active ? (Math.max(0, active.bill.remaining) as Paise) : (0 as Paise);
        const status = !active
          ? "free"
          : billed
            ? `bill given ${formatWaited(billed.billedAt, now)} ago, ${formatPrice(owed)} to pay`
            : [formatPrice(active.ticket.total), lastSent ? formatSentAgo(lastSent, now) : "", unsent ? "not sent yet" : ""]
                .filter(Boolean)
                .join(", ");
        const look = !active ? "bg-surface text-ink" : billed ? "bg-warning text-white" : "bg-ink text-bg";
        return (
          <li key={table.id}>
            <Link
              to={`/tables/${table.id}`}
              aria-label={`${tableTitle(table.name)}, ${status}`}
              className={`relative flex aspect-square min-h-24 flex-col justify-between rounded-2xl p-3 transition-transform active:scale-[0.97] ${look}`}
            >
              <span className="truncate text-[28px] leading-none font-bold tracking-tight">{table.name}</span>
              {unsent && <span aria-hidden className="absolute top-3.5 right-3 h-2.5 w-2.5 rounded-full bg-primary" />}
              {active && billed && (
                <span className="min-w-0">
                  <span className="block truncate text-[17px] font-semibold tabular-nums">{formatPrice(owed)}</span>
                  <span className="block truncate text-[13px] opacity-85 tabular-nums">
                    {/* "Just now" doesn't fit beside "Bill" on a phone tile. */}
                    {formatWaited(billed.billedAt, now) === "Just now" ? "Bill given" : `Bill · ${formatWaited(billed.billedAt, now)}`}
                  </span>
                </span>
              )}
              {active && !billed && (
                <span className="min-w-0">
                  <span className="block truncate text-[17px] font-semibold tabular-nums">{formatPrice(active.ticket.total)}</span>
                  <span className="block truncate text-[13px] opacity-70 tabular-nums">
                    {lastSent ? formatWaited(lastSent, now) : "Not sent"}
                  </span>
                </span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
