import { useState } from "react";
import { MdChevronLeft, MdChevronRight, MdInsights } from "react-icons/md";
import { isQuiet, type DayNumbers } from "../../domain/dayBook";
import type { DrawerKind } from "../../domain/drawer";
import type { Paise } from "../../domain/money";
import type { BusinessDate } from "../../domain/order";
import { useDayNumbers, type Day } from "../../usecases/useDayNumbers";
import { ListFact, ListRow, ListSection } from "../design-system/GroupedList";
import { CashSheet } from "../features/today/CashSheet";
import { dayLabel, formatDay, formatPrice, formatSigned } from "../format";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// The day's numbers, in the order an owner reads them at midnight: what came
// in, what went out, what is left, what the cash box should hold, then
// anything worth a second look. Earlier days are one tap away.
export default function Today() {
  // Visual-only state: which day is being read. null is today.
  const [chosen, setChosen] = useState<BusinessDate | null>(null);
  const day = useDayNumbers(chosen);
  const [stating, setStating] = useState<DrawerKind | null>(null);
  const atToday = day.day === day.today;

  const header = (
    <header className="mb-4 flex min-h-11 items-center justify-between gap-2">
      <div className="min-w-0">
        <h1 className="truncate text-[28px] leading-tight font-bold tracking-tight">{dayLabel(day.day, day.today)}</h1>
        <p className="text-[15px] text-muted">{formatDay(day.day)}</p>
      </div>
      <div className="flex shrink-0 items-center">
        <button
          type="button"
          aria-label="Earlier day"
          onClick={() => setChosen(day.state === "ready" ? day.previous : null)}
          disabled={day.state !== "ready"}
          className="flex h-11 w-11 items-center justify-center rounded-xl text-3xl text-primary active:bg-surface-2 disabled:opacity-40"
        >
          <MdChevronLeft aria-hidden />
        </button>
        <button
          type="button"
          aria-label="Later day"
          onClick={() => setChosen(day.state === "ready" && day.next !== day.today ? day.next : null)}
          disabled={day.state !== "ready" || atToday}
          className="flex h-11 w-11 items-center justify-center rounded-xl text-3xl text-primary active:bg-surface-2 disabled:opacity-30"
        >
          <MdChevronRight aria-hidden />
        </button>
      </div>
    </header>
  );
  if (day.state === "loading") return <section className="mx-auto max-w-3xl">{header}</section>;

  const { numbers: n } = day;
  const quiet = isQuiet(n);
  return (
    <section className="mx-auto max-w-3xl">
      {header}
      <div className="space-y-6">
        {quiet ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <MdInsights className="mb-3 text-5xl text-muted/60" aria-hidden />
            <p className="text-[17px] font-semibold">{day.isToday ? "Nothing yet today" : "Nothing on this day"}</p>
            <p className="mt-1 max-w-xs text-[15px] text-muted">
              {day.isToday ? "Settled bills and expenses add up here as the day goes." : "No bills were paid and no expenses noted."}
            </p>
          </div>
        ) : (
          <Summary n={n} />
        )}
        <Drawer day={day} onState={setStating} />
        {!quiet && <Attention n={n} />}
        {n.top.length > 0 && (
          <ListSection header="Sold most">
            {n.top.map((d) => (
              <ListFact key={d.itemId} label={d.name} value={`× ${d.quantity}`} />
            ))}
          </ListSection>
        )}
      </div>
      <CashSheet kind={stating} day={day} onClose={() => setStating(null)} />
    </section>
  );
}

function Summary({ n }: { n: DayNumbers }) {
  return (
    <>
      <section className="pt-2 text-center">
        <p className="text-[13px] font-semibold tracking-wide text-muted uppercase">Sales</p>
        <p className="mt-1 text-[44px] leading-none font-bold tracking-tight tabular-nums">{formatPrice(n.sales.total)}</p>
        <p className="mt-2 text-[15px] text-muted tabular-nums">
          Cash {formatPrice(n.sales.cash)} · UPI {formatPrice(n.sales.upi)}
        </p>
      </section>
      <ListSection>
        <ListFact
          label="Spent"
          detail={n.spent.total > 0 ? `Cash ${formatPrice(n.spent.cash)} · UPI ${formatPrice(n.spent.upi)}` : undefined}
          value={formatPrice(n.spent.total)}
        />
        <ListFact label="Left" value={formatSigned(n.left)} strong />
      </ListSection>
    </>
  );
}

// The cash box, which the owner checks at closing: what it should hold from
// what it started with and the day's cash in and out, then what they counted.
// Stating either is one tap; yesterday's count carries in as today's start.
function Drawer({ day, onState }: { day: Extract<Day, { state: "ready" }>; onState: (kind: DrawerKind) => void }) {
  const { drawer: d } = day;
  const tap = (text: string) => <span className="text-[17px] font-semibold text-primary">{text}</span>;
  return (
    <ListSection
      header="Cash drawer"
      footer={
        d.expected === undefined
          ? "Add what the drawer started with to see what it should hold."
          : d.counted === undefined
            ? "Count it at closing to see if it matches."
            : undefined
      }
    >
      <ListFact
        label={d.expected === undefined ? "Taken less spent" : "Should hold"}
        detail={d.opening === undefined ? undefined : `Started ${formatPrice(d.opening)} · ${formatSigned(d.movement)} today`}
        value={formatSigned(d.expected ?? d.movement)}
        strong
      />
      <ListRow
        detail={d.carried ? "Carried from yesterday's count" : undefined}
        trailing={d.opening === undefined ? tap("Add") : <span className="text-[17px] font-semibold tabular-nums">{formatPrice(d.opening)}</span>}
        onClick={() => onState("opening")}
      >
        Started with
      </ListRow>
      <ListRow
        trailing={d.counted === undefined ? tap("Count") : <span className="text-[17px] font-semibold tabular-nums">{formatPrice(d.counted)}</span>}
        onClick={() => onState("counted")}
      >
        Counted
      </ListRow>
      {d.difference !== undefined && (
        <ListFact
          label="Difference"
          value={
            <span className={d.difference === 0 ? "text-success" : "text-warning"}>
              {d.difference === 0 ? "Matches" : `${d.difference < 0 ? "Short" : "Over"} ${formatPrice(Math.abs(d.difference) as Paise)}`}
            </span>
          }
          strong
        />
      )}
    </ListSection>
  );
}

// What an owner would want to know before trusting the total: each line is
// shown only when it is not zero.
function Attention({ n }: { n: DayNumbers }) {
  const facts = [
    n.unpaid.count > 0 && {
      label: "Not paid yet",
      detail: plural(n.unpaid.count, "bill", "bills"),
      value: formatPrice(n.unpaid.amount),
    },
    n.cancelled.dishes > 0 && {
      label: "Cancelled after sending",
      detail: plural(n.cancelled.dishes, "dish", "dishes"),
      value: formatPrice(n.cancelled.value),
    },
    n.discounts.count > 0 && {
      label: "Discounts",
      detail: plural(n.discounts.count, "bill", "bills"),
      value: formatPrice(n.discounts.amount),
    },
    n.removed.count > 0 && {
      label: "Payments removed",
      detail: plural(n.removed.count, "payment", "payments"),
      value: formatPrice(n.removed.amount),
    },
    n.corrected > 0 && { label: "Payments corrected", detail: "Cash or UPI put right", value: `${n.corrected}` },
  ].filter((f): f is { label: string; detail: string; value: string } => f !== false);
  if (facts.length === 0) return null;
  return (
    <ListSection header="Worth a look">
      {facts.map((f) => (
        <ListFact key={f.label} {...f} />
      ))}
    </ListSection>
  );
}
