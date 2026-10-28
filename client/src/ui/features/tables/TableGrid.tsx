import { Link } from "react-router";
import type { TableView } from "../../../usecases/useTables";
import { formatPrice, formatSentAgo, formatWaited } from "../../format";
import { useNow } from "../../useNow";
import { tableTitle } from "../order/labels";

// The floor at a glance: a quiet tile is free; a solid one has guests, with
// what they owe and how long since their last round went to the kitchen.
export function TableGrid({ floor }: { floor: TableView[] }) {
  const now = useNow();
  return (
    <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
      {floor.map(({ table, active }) => {
        const unsent = active ? active.ticket.draft.length > 0 : false;
        const lastSent = active?.ticket.lastSentAt;
        const status = !active
          ? "free"
          : [formatPrice(active.ticket.total), lastSent ? formatSentAgo(lastSent, now) : "", unsent ? "not sent yet" : ""]
              .filter(Boolean)
              .join(", ");
        return (
          <li key={table.id}>
            <Link
              to={`/tables/${table.id}`}
              aria-label={`${tableTitle(table.name)}, ${status}`}
              className={`relative flex aspect-square min-h-24 flex-col justify-between rounded-2xl p-3 transition-transform active:scale-[0.97] ${
                active ? "bg-ink text-bg" : "bg-surface text-ink"
              }`}
            >
              <span className="truncate text-[28px] leading-none font-bold tracking-tight">{table.name}</span>
              {unsent && <span aria-hidden className="absolute top-3.5 right-3 h-2.5 w-2.5 rounded-full bg-primary" />}
              {active && (
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
