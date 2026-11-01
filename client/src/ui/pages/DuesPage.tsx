import { useState } from "react";
import { MdChevronLeft } from "react-icons/md";
import { Link } from "react-router";
import { businessDate } from "../../domain/order";
import type { Paise } from "../../domain/money";
import { useDues } from "../../usecases/useDues";
import { ListRow, ListSection } from "../design-system/GroupedList";
import { RepaySheet } from "../features/dues/RepaySheet";
import { dayLabel, formatPrice } from "../format";

// Who has bills on their name: the notebook by the counter, longest waiting
// first. A name opens to take the money back.
export default function DuesPage() {
  const dues = useDues();
  // Visual-only state: whose name is open.
  const [viewing, setViewing] = useState<string | null>(null);

  const header = (
    <header className="sticky top-0 z-10 -mx-4 mb-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2 bg-bg/95 px-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 backdrop-blur md:-mx-6 md:px-4">
      <Link to="/orders" className="-ml-1 flex min-h-11 items-center justify-self-start pr-2 text-[17px] text-primary">
        <MdChevronLeft aria-hidden className="text-3xl" />
        Orders
      </Link>
      <h1 className="truncate text-[17px] font-semibold">Pay Later</h1>
      <span />
    </header>
  );
  if (dues.state === "loading") return header;

  const open = dues.dues.find((d) => d.phone === viewing) ?? null;
  return (
    <section className="mx-auto max-w-3xl">
      {header}
      <div className="mb-6 rounded-2xl bg-surface px-4 py-4 text-center">
        <p className="text-[13px] font-semibold text-muted">Owed by regulars</p>
        <p className="mt-0.5 text-[28px] font-bold tabular-nums">{formatPrice(dues.total)}</p>
      </div>
      {dues.dues.length === 0 ? (
        <p className="py-12 text-center text-[15px] text-muted">Nobody owes anything. Choose Later on a bill to put it on a regular&rsquo;s name.</p>
      ) : (
        <ListSection header={`${dues.dues.length} ${dues.dues.length === 1 ? "person" : "people"}`}>
          {dues.dues.map((due) => (
            <ListRow
              key={due.phone}
              detail={
                due.owed < 0
                  ? "Paid back twice?"
                  : `${due.bills.length} ${due.bills.length === 1 ? "bill" : "bills"}${due.since ? ` · since ${dayLabel(businessDate(due.since), dues.today).toLowerCase()}` : ""}`
              }
              trailing={
                <span className={`shrink-0 text-[17px] font-semibold tabular-nums ${due.owed < 0 ? "text-warning" : ""}`}>
                  {due.owed < 0 ? `${formatPrice(-due.owed as Paise)} extra` : formatPrice(due.owed as Paise)}
                </span>
              }
              onClick={() => setViewing(due.phone)}
            >
              {due.customer}
            </ListRow>
          ))}
        </ListSection>
      )}
      <RepaySheet due={open} dues={dues} onClose={() => setViewing(null)} />
    </section>
  );
}
